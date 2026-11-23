// Comprehensive Fee Sync Engine
// Handles: Google Sheets fetch, parsing, batching, checkpoints, versioning, publishing
// Runs server-side, survives browser closure, handles interruptions with checkpoints

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createCircuitBreaker } from '../_shared/circuit-breaker.ts';
import { canonicalCountry, importClassesSheet, importSheet, type ImportIssue, type ParsedClassRecord, type ParsedFeeRecord } from './importer.ts';

const sheetsBreaker = createCircuitBreaker({ name: 'google-sheets', failureThreshold: 3, cooldownMs: 120_000, timeoutMs: 35_000 });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const GOOGLE_REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Google Sheets request timed out after 30 seconds.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface SyncConfig {
  batchSize: number;
  maxRecoveryAttempts: number;
  heartbeatIntervalMs: number;
  checkpointIntervalMs: number;
}

// ============================================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================================

async function googleAccessToken(credentials: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: string) => btoa(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header = encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = encode(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const pem = Uint8Array.from(
    atob(
      credentials.private_key
        .replace(/\\n/g, '\n')
        .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
        .replace(/\s/g, '')
    ),
    (char) => char.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey('pkcs8', pem, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  const signed = `${header}.${claim}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;

  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(`Google authentication failed: ${body.error || 'Unknown error'}`);
  }

  return body.access_token;
}

async function readGoogleSheet(
  spreadsheetId: string,
  accessToken: string,
  sheetName: string
): Promise<string[][]> {
  const sheetRangeEnvironment: Record<string, string> = {
    Classes: 'GOOGLE_SHEETS_CLASSES_RANGE',
    'Up to 5 classes': 'GOOGLE_SHEETS_UP_TO_5_CLASSES_RANGE',
    'Multi-class': 'GOOGLE_SHEETS_MULTI_CLASS_RANGE',
    'Up to 3 classes': 'GOOGLE_SHEETS_UP_TO_3_CLASSES_RANGE',
  };
  const configuredRange = (Deno.env.get(sheetRangeEnvironment[sheetName] || 'GOOGLE_SHEETS_RANGE') || '').trim();
  const configuredRanges = configuredRange.split(',').map((value) => value.trim()).filter(Boolean);
  const matchingRange = configuredRanges.find((value) => value.split('!')[0].trim().toLowerCase() === sheetName.toLowerCase());
  const defaultRange = matchingRange || (configuredRanges.length === 1 && configuredRanges[0].split('!')[0].trim().toLowerCase() === sheetName.toLowerCase() ? configuredRanges[0] : `${sheetName}!A:ZZ`);
  const ranges = sheetName === CLASS_SHEET
    ? [defaultRange, 'Classes!A:ZZ', 'Class!A:ZZ', 'Nice Classes!A:ZZ', 'Goods and Services!A:ZZ']
    : [defaultRange];
  let lastError = '';

  for (const range of [...new Set(ranges)]) {
    const response = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const body = (await response.json().catch(() => ({}))) as { values?: string[][]; error?: { message?: string } };
    if (response.ok && Array.isArray(body.values) && body.values.length > 0) return body.values as string[][];
    if (!response.ok) lastError = body.error?.message || `HTTP ${response.status}`;
  }

  if (lastError) throw new Error(`Failed to read sheet "${sheetName}": ${lastError}`);
  return [];
}

// ============================================================================
// SYNC LOGIC
// ============================================================================

async function createSyncRun(db: any, userId: string, datasetVersionId: string) {
  const { data, error } = await db
    .from('fee_sync_runs')
    .insert({
      status: 'queued',
      started_by: userId,
      dataset_version_id: datasetVersionId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create sync run: ${error.message}`);
  return data.id;
}

async function createDatasetVersion(db: any, syncRunId: string, userId: string) {
  // Get next version number
  const { data: latest } = await db.from('fee_dataset_versions').select('version_number').order('version_number', { ascending: false }).limit(1);
  const nextVersion = (latest && latest[0]?.version_number) ? latest[0].version_number + 1 : 1;

  const { data, error } = await db
    .from('fee_dataset_versions')
    .insert({
      version_number: nextVersion,
      status: 'staging',
      sync_run_id: syncRunId,
      published_by: userId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create dataset version: ${error.message}`);
  return data.id;
}

async function acquireSyncLock(db: any, syncRunId: string, userId: string, durationSeconds: number = 3600) {
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  const { error: staleLockError } = await db
    .from('fee_sync_locks')
    .update({
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .is('released_at', null)
    .lt('expires_at', new Date().toISOString());

  if (staleLockError) throw new Error(`Failed to reclaim stale sync lock: ${staleLockError.message}`);

  const { data, error } = await db
    .from('fee_sync_locks')
    .insert({
      sync_run_id: syncRunId,
      owner_user_id: userId,
      acquired_at: new Date().toISOString(),
      expires_at: expiresAt,
      heartbeat_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to acquire sync lock: ${error.message}`);
  return data.id;
}

async function updateSyncRunProgress(db: any, syncRunId: string, updates: any) {
  const { error } = await db
    .from('fee_sync_runs')
    .update({
      ...updates,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', syncRunId);

  if (error) throw new Error(`Failed to update sync run: ${error.message}`);
}

function redactMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactMetadata);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (/(password|token|secret|private.?key|service.?role|authorization|credential)/i.test(key)) {
      return [key, '[REDACTED]'];
    }
    return [key, redactMetadata(entry)];
  }));
}

type SyncLogContext = {
  sheet_name?: string;
  batch_number?: number;
  source_row?: number;
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
};

async function logSyncEvent(
  db: any,
  syncRunId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>,
  context: SyncLogContext = {}
) {
  const { error } = await db.from('fee_sync_logs').insert({
    sync_run_id: syncRunId,
    event_type: eventType,
    severity: context.severity || 'info',
    message,
    sheet_name: context.sheet_name,
    batch_number: context.batch_number,
    source_row: context.source_row,
    metadata: redactMetadata(metadata || {}),
    created_at: new Date().toISOString(),
  });
  if (error) console.error('Failed to persist sync log:', error.message);
}

async function recordSyncError(
  db: any,
  syncRunId: string,
  errorType: string,
  message: string,
  retryable: boolean,
  context: SyncLogContext = {}
) {
  const { error } = await db.from('fee_sync_errors').insert({
    sync_run_id: syncRunId,
    sheet_name: context.sheet_name,
    batch_number: context.batch_number,
    source_row: context.source_row,
    error_type: errorType,
    error_message: message,
    retryable,
    attempt_number: 1,
    max_attempts: retryable ? 3 : 1,
  });
  if (error) console.error('Failed to persist sync error:', error.message);
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(timeout|temporar|rate.?limit|429|502|503|504|network|fetch failed|connection)/i.test(message);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  onRetry: (error: unknown, attempt: number) => Promise<void>,
  maxAttempts = 3
): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableError(error)) throw error;
      await onRetry(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
      attempt += 1;
    }
  }
}

async function getPublishedVersionId(db: any): Promise<string | null> {
  const { data } = await db
    .from('fee_dataset_versions')
    .select('id')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

async function saveCheckpoint(
  db: any,
  syncRunId: string,
  sheetName: string,
  batch: number,
  totalBatches: number,
  processedRows: number,
  totalRows: number,
  stats: any,
  recoveryAttempts = 0
) {
  const now = new Date().toISOString();
  const { error } = await db.from('fee_sync_checkpoints').upsert({
    sync_run_id: syncRunId,
    sheet_name: sheetName,
    current_batch: batch,
    total_batches: totalBatches,
    processed_rows: processedRows,
    total_rows: totalRows,
    last_processed_position: processedRows,
    last_successful_position: processedRows,
    last_activity_at: now,
    heartbeat_at: now,
    recovery_attempts: recoveryAttempts,
    started_at: now,
    completed_at: now,
    inserted_count: stats.inserted || 0,
    updated_count: stats.updated || 0,
    skipped_count: stats.skipped || 0,
    error_count: stats.errors || 0,
    updated_at: now,
  }, { onConflict: 'sync_run_id,sheet_name,current_batch' });

  if (error) throw new Error(`Failed to save sync checkpoint: ${error.message}`);
}

const REQUIRED_SHEETS = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others', 'Up to 5 classes', 'Multi-class', 'Up to 3 classes'];
const OPTIONAL_CLASS_MATRIX_SHEETS = new Set(['Up to 5 classes', 'Multi-class', 'Up to 3 classes']);
const CLASS_SHEET = 'Classes';
const REQUIRED_CLASS_COUNT = 45;
const VALID_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'AED', 'INR', 'ZAR']);

const DEFAULT_CATEGORIES = [
  { name: 'Trademark', is_primary: true, display_order: 1 },
  { name: 'Patent', is_primary: true, display_order: 2 },
  { name: 'Design', is_primary: true, display_order: 3 },
  { name: 'Copyright', is_primary: true, display_order: 4 },
  { name: 'Others', is_primary: true, display_order: 5 },
  { name: 'Up to 5 classes', is_primary: true, display_order: 6 },
  { name: 'Multi-class', is_primary: true, display_order: 7 },
  { name: 'Up to 3 classes', is_primary: true, display_order: 8 },
];

async function ensureDefaultCategories(db: any) {
  for (const category of DEFAULT_CATEGORIES) {
    const { error } = await db
      .from('fee_categories')
      .upsert(category, { onConflict: 'name' });
    if (error) throw new Error(`Failed to initialize fee category ${category.name}: ${error.message}`);
  }
}

function calculateSheetProgress(records: ParsedFeeRecord[], processedRows: number): Record<string, 'complete' | 'processing' | 'pending'> {
  const processed = records.slice(0, processedRows);
  const totals = new Map(REQUIRED_SHEETS.map((sheet) => [sheet, records.filter((record) => record.source_sheet === sheet).length]));
  const completed = new Map(REQUIRED_SHEETS.map((sheet) => [sheet, processed.filter((record) => record.source_sheet === sheet).length]));
  return Object.fromEntries(REQUIRED_SHEETS.map((sheet) => {
    const total = totals.get(sheet) || 0;
    const done = completed.get(sheet) || 0;
    return [sheet, total > 0 && done >= total ? 'complete' : done > 0 ? 'processing' : 'pending'];
  }));
}

function validateImportedSheets(
  sheetResults: Map<string, { records: ParsedFeeRecord[]; issues: ImportIssue[]; header_rows: number[] }>,
  countryNames: Set<string>
) {
  const errors: Array<{ sheet: string; row: number; type: string; message: string }> = [];
  let sourceRecordCount = 0;
  let invalidRecordCount = 0;
  let duplicateRecordCount = 0;

  for (const sheetName of REQUIRED_SHEETS) {
    const result = sheetResults.get(sheetName);
    if (!result || result.header_rows.length === 0) {
      errors.push({ sheet: sheetName, row: 0, type: 'missing_sheet_or_header', message: `Required sheet "${sheetName}" is missing or has no recognizable headers.` });
      continue;
    }
    if (result.records.length === 0 && !OPTIONAL_CLASS_MATRIX_SHEETS.has(sheetName)) {
      errors.push({ sheet: sheetName, row: 0, type: 'empty_sheet', message: `Required sheet "${sheetName}" contains no valid fee records.` });
    }
    sourceRecordCount += result.records.length;
    for (const issue of result.issues) {
      if (issue.type === 'duplicate') duplicateRecordCount += 1;
      if (issue.type === 'invalid_fee' || issue.type === 'missing_country' || issue.type === 'unrecognized_structure') {
        errors.push(issue);
      }
    }
    for (const record of result.records) {
      // Defensive final normalization: source bytes can be mojibake before the importer sees them.
      const countrySignature = record.country.toLowerCase().replace(/[^a-z]/g, '');
      if (/^s.*tom.*pr.*ncipe$/.test(countrySignature)) record.country = 'Sao Tome and Principe';
      if (!countryNames.has(record.country.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())) {
        invalidRecordCount += 1;
        errors.push({ sheet: sheetName, row: record.source_row, type: 'unknown_country', message: `Country "${record.country}" is not present in the countries table.` });
      }
      if (!record.service.trim()) {
        invalidRecordCount += 1;
        errors.push({ sheet: sheetName, row: record.source_row, type: 'missing_service', message: 'Fee record has no service name.' });
      }
      if (!record.currency || !VALID_CURRENCIES.has(record.currency)) {
        invalidRecordCount += 1;
        errors.push({ sheet: sheetName, row: record.source_row, type: 'invalid_currency', message: `Unsupported currency "${record.currency || ''}".` });
      }
      if (record.official_fee === undefined && record.attorney_fee === undefined && record.total_fee === undefined) {
        invalidRecordCount += 1;
        errors.push({ sheet: sheetName, row: record.source_row, type: 'invalid_fee', message: 'Fee record has no numeric fee value.' });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sourceRecordCount,
    validRecordCount: Math.max(0, sourceRecordCount - invalidRecordCount),
    invalidRecordCount,
    duplicateRecordCount,
  };
}

// ============================================================================
// MAIN SYNC HANDLER
// ============================================================================

Deno.serve(async (request: Request) => {
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
  const googleServiceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');

  if (!supabaseUrl || !serviceRoleKey || !spreadsheetId || !googleServiceAccountJson) {
    return new Response(
      JSON.stringify({
        error: 'Server configuration is missing. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SHEETS_SPREADSHEET_ID, and GOOGLE_SERVICE_ACCOUNT_JSON.',
      }),
      { status: 500, headers: corsHeaders }
    );
  }

  const db = createClient(supabaseUrl, serviceRoleKey);
  let syncRunId: string | undefined;
  let datasetVersionId: string | undefined;
  let lockId: string | undefined;
  let resumePosition = 0;
  let recoveryAttempts = 0;

  try {
    // Authenticate
    const schedulerSecret = request.headers.get('x-fee-sync-scheduler-secret');
    const isScheduledRun = Boolean(schedulerSecret && schedulerSecret === serviceRoleKey);
    let user: { id: string } | null = null;

    if (isScheduledRun) {
      const { data: schedulerUser } = await db
        .from('profiles')
        .select('id')
        .eq('role', 'administrator')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!schedulerUser) throw new Error('No administrator is available for scheduled synchronization');
      user = schedulerUser;
    }

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!isScheduledRun && !token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    if (!isScheduledRun) {
      const { data: authData, error: userError } = await db.auth.getUser(token as string);
      if (userError || !authData.user) {
        return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
          status: 401,
          headers: corsHeaders,
        });
      }
      user = authData.user;
    }
    if (!user) throw new Error('Synchronization actor could not be resolved');

    // Check admin role
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'administrator') {
      return new Response(JSON.stringify({ error: 'Administrator access required' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const requestBody = (await request.json().catch(() => ({}))) as { action?: string; sync_run_id?: string };
    if (requestBody.action === 'resume-sync') {
      if (!requestBody.sync_run_id) throw new Error('sync_run_id is required to resume synchronization');
      const { data: interruptedRun, error: interruptedRunError } = await db
        .from('fee_sync_runs')
        .select('id, dataset_version_id, status, recovery_attempts')
        .eq('id', requestBody.sync_run_id)
        .single();
      if (interruptedRunError || !interruptedRun) throw new Error('Interrupted sync run was not found');
      if (!['interrupted', 'recovering'].includes(interruptedRun.status)) throw new Error('Only interrupted sync runs can be resumed');
      recoveryAttempts = (interruptedRun.recovery_attempts || 0) + 1;
      const maxRecoveryAttempts = Number.parseInt(Deno.env.get('FEE_SYNC_MAX_RECOVERY_ATTEMPTS') || '3', 10);
      if (recoveryAttempts > maxRecoveryAttempts) throw new Error('Maximum synchronization recovery attempts exceeded');
      syncRunId = interruptedRun.id;
      datasetVersionId = interruptedRun.dataset_version_id;
      const { data: checkpoint } = await db
        .from('fee_sync_checkpoints')
        .select('last_successful_position, recovery_attempts')
        .eq('sync_run_id', syncRunId)
        .eq('sheet_name', 'all')
        .order('current_batch', { ascending: false })
        .limit(1)
        .maybeSingle();
      resumePosition = checkpoint?.last_successful_position || 0;
      await db.from('fee_dataset_versions').update({ status: 'staging', updated_at: new Date().toISOString() }).eq('id', datasetVersionId);
      await db.from('fee_sync_runs').update({
        status: 'recovering',
        recovery_attempts: recoveryAttempts,
        error_message: null,
        current_stage: 'recovering',
        current_operation: `Resuming from checkpoint at row ${resumePosition}`,
        updated_at: new Date().toISOString(),
      }).eq('id', syncRunId);
      await db.from('fee_sync_logs').insert({
        sync_run_id: syncRunId,
        event_type: 'SYNC_RECOVERING',
        severity: 'warning',
        message: `Resuming synchronization from checkpoint at row ${resumePosition}`,
        metadata: { recovery_attempts: recoveryAttempts, resume_position: resumePosition },
      });
    }

    // Parse credentials
    let credentials: { client_email: string; private_key: string };
    try {
      credentials = JSON.parse(googleServiceAccountJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }

    const previousPublishedVersionId = await getPublishedVersionId(db);

    // Create sync run and dataset version
    if (!syncRunId) {
      const { data: activeRun } = await db
        .from('fee_sync_runs')
        .select('id, status, last_activity_at')
        .in('status', ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeRun) {
        const lastActivity = activeRun.last_activity_at ? new Date(activeRun.last_activity_at).getTime() : 0;
        if (lastActivity > 0 && Date.now() - lastActivity > 10 * 60 * 1000) {
          await db.from('fee_sync_runs').update({ status: 'cancelled', current_stage: 'cancelled', current_operation: 'Cancelled stale synchronization run', error_message: 'The synchronization stopped responding for more than 10 minutes.', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', activeRun.id);
          await db.from('fee_sync_locks').update({ released_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('sync_run_id', activeRun.id).is('released_at', null);
        } else {
        return new Response(JSON.stringify({
          message: 'A fee synchronization is already in progress. Monitoring the active sync.',
          sync_run_id: activeRun.id,
          status: activeRun.status,
        }), { status: 202, headers: corsHeaders });
        }
      }

      const { data: latestVersion } = await db
        .from('fee_dataset_versions')
        .select('version_number')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
      const versionData = await db
        .from('fee_dataset_versions')
        .insert({ status: 'staging', version_number: nextVersionNumber })
        .select('id')
        .single();
      datasetVersionId = versionData.data?.id;
      if (!datasetVersionId) throw new Error('Failed to create a dataset version');

      const syncRunData = await db
        .from('fee_sync_runs')
        .insert({ status: 'starting', started_by: user.id, dataset_version_id: datasetVersionId, current_stage: 'fetching' })
        .select('id')
        .single();
      syncRunId = syncRunData.data?.id;
      if (!syncRunId) throw new Error('Failed to create a sync run');
    }

    // Acquire lock
    lockId = await acquireSyncLock(db, syncRunId, user.id);

    // Fetch all sheets
    await logSyncEvent(db, syncRunId, 'SYNC_CREATED', 'Synchronization run created', { dataset_version_id: datasetVersionId });
    await logSyncEvent(db, syncRunId, 'SYNC_STARTED', 'Google Sheets synchronization started');

    const sheetNames = [...REQUIRED_SHEETS, CLASS_SHEET];
    const googleToken = await googleAccessToken(credentials);
    const allRecords: ParsedFeeRecord[] = [];
    let classRecords: ParsedClassRecord[] = [];
    const sheetResults = new Map<string, { records: ParsedFeeRecord[]; issues: ImportIssue[]; header_rows: number[] }>();

    for (const sheetName of sheetNames) {
      const sheetStartedAt = new Date().toISOString();
      await updateSyncRunProgress(db, syncRunId, {
        status: 'starting',
        current_stage: 'fetching',
        current_sheet: sheetName,
        current_operation: `Fetching Google Sheet: ${sheetName}`,
        heartbeat_at: sheetStartedAt,
      });
      await logSyncEvent(db, syncRunId, 'SHEET_STARTED', `Processing sheet: ${sheetName}`);

      const rows = await withRetry(
        () => sheetsBreaker.call(() => readGoogleSheet(spreadsheetId, googleToken, sheetName)),
        async (error, attempt) => {
          const message = error instanceof Error ? error.message : String(error);
          await logSyncEvent(db, syncRunId, 'RETRY_SCHEDULED', `Retrying read for ${sheetName}`, { attempt, error_message: message }, { sheet_name: sheetName, severity: 'warning' });
          await recordSyncError(db, syncRunId, 'sheet_read_retry', message, true, { sheet_name: sheetName });
        }
      );
      if (sheetName === CLASS_SHEET) {
        const importedClasses = importClassesSheet(rows);
        classRecords = importedClasses.records;
        for (const issue of importedClasses.issues) {
          await logSyncEvent(db, syncRunId, 'IMPORT_WARNING', issue.message, { sheet: issue.sheet, source_row: issue.row, issue_type: issue.type }, { sheet_name: sheetName, source_row: issue.row, severity: 'warning' });
          await recordSyncError(db, syncRunId, `import_${issue.type}`, issue.message, false, { sheet_name: sheetName, source_row: issue.row });
        }
        const importedClassNumbers = new Set(classRecords.map((record) => record.class_number));
        const missingClassNumbers = Array.from({ length: REQUIRED_CLASS_COUNT }, (_, index) => index + 1)
          .filter((classNumber) => !importedClassNumbers.has(classNumber));
        if (missingClassNumbers.length > 0) {
          await logSyncEvent(db, syncRunId, 'CLASSES_INCOMPLETE', `Classes sheet is missing ${missingClassNumbers.length} class number(s); fee sheets will still be synchronized.`, {
            missing_class_numbers: missingClassNumbers,
          }, { sheet_name: CLASS_SHEET, severity: 'warning' });
        }
        await logSyncEvent(db, syncRunId, 'SHEET_COMPLETED', `Completed sheet: ${sheetName}`, { record_count: classRecords.length, issue_count: importedClasses.issues.length });
        continue;
      }
      const imported = importSheet(sheetName, rows);
      sheetResults.set(sheetName, imported);
      allRecords.push(...imported.records);

      const warningSample = imported.issues.slice(0, 20);
      for (const issue of warningSample) {
        await logSyncEvent(db, syncRunId, 'IMPORT_WARNING', issue.message, {
          sheet: issue.sheet,
          source_row: issue.row,
          issue_type: issue.type,
          header_rows: imported.header_rows,
        }, { sheet_name: sheetName, source_row: issue.row, severity: 'warning' });
        await recordSyncError(db, syncRunId, `import_${issue.type}`, issue.message, false, { sheet_name: sheetName, source_row: issue.row });
      }
      if (imported.issues.length > warningSample.length) {
        await logSyncEvent(db, syncRunId, 'IMPORT_WARNING_SUMMARY', `Suppressed ${imported.issues.length - warningSample.length} additional import warnings`, {
          total_issues: imported.issues.length,
          recorded_issues: warningSample.length,
        }, { sheet_name: sheetName, severity: 'warning' });
      }

      await logSyncEvent(db, syncRunId, 'SHEET_COMPLETED', `Completed sheet: ${sheetName}`, {
        record_count: imported.records.length,
        issue_count: imported.issues.length,
        header_rows: imported.header_rows,
      });
      await updateSyncRunProgress(db, syncRunId, {
        status: 'starting',
        current_stage: 'fetching',
        current_sheet: sheetName,
        current_operation: `Fetched Google Sheet: ${sheetName}`,
        heartbeat_at: new Date().toISOString(),
      });
    }

    // Load canonical reference data before validation. Unknown countries must not be silently skipped.
    await ensureDefaultCategories(db);
    const { data: categories, error: categoryError } = await db.from('fee_categories').select('id, name');
    if (categoryError) throw new Error(`Failed to load fee categories: ${categoryError.message}`);
    const { data: countries, error: countriesError } = await db.from('countries').select('id, name');
    if (countriesError) throw new Error(`Failed to load countries: ${countriesError.message}`);
    const regionalCountries = [
      { name: 'ARIPO', abbreviation: 'ARI', flag_url: '/ARIPO' },
      { name: 'OAPI', abbreviation: 'OAP', flag_url: '/OAPI' },
      { name: 'European Union', abbreviation: 'EUR', flag_url: '/EU' },
      { name: 'Benelux', abbreviation: 'BNX', flag_url: '/BNX' },
      { name: 'Northern Cyprus', abbreviation: 'NCY', flag_url: '/NCY' },
    ];
    const missingRegionalCountries = regionalCountries.filter(region => !(countries || []).some(country => country.name.toLowerCase() === region.name.toLowerCase()));
    if (missingRegionalCountries.length > 0) {
      const { error: regionalCountryError } = await db.from('countries').insert(missingRegionalCountries);
      if (regionalCountryError) throw new Error(`Failed to initialize regional fee entities: ${regionalCountryError.message}`);
    }
    const allCountries = [...(countries || []), ...missingRegionalCountries.map(country => ({ id: '', name: country.name }))];
    const countryNames = new Set(allCountries.map((country: any) => country.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()));
    const validation = validateImportedSheets(sheetResults, countryNames);
    await logSyncEvent(db, syncRunId, 'VALIDATION_STARTED', 'Validating imported fee data');

    await db.from('fee_dataset_versions').update({
      status: 'validating',
      total_records: validation.sourceRecordCount,
      validation_summary: {
        valid: validation.valid,
        source_record_count: validation.sourceRecordCount,
        valid_record_count: validation.validRecordCount,
        invalid_record_count: validation.invalidRecordCount,
        duplicate_record_count: validation.duplicateRecordCount,
        errors: validation.errors.slice(0, 100),
      },
      updated_at: new Date().toISOString(),
    }).eq('id', datasetVersionId);

    await updateSyncRunProgress(db, syncRunId, {
      status: 'validating',
      total_rows: validation.sourceRecordCount,
      source_record_count: validation.sourceRecordCount,
      valid_record_count: validation.validRecordCount,
      invalid_record_count: validation.invalidRecordCount,
      error_count: validation.errors.length,
      current_stage: 'validating',
      current_operation: 'Validating imported fee data',
      percentage: 95,
      sheet_progress: { ...Object.fromEntries(REQUIRED_SHEETS.map((sheet) => [sheet, 'complete'])), Classes: classRecords.length ? 'complete' : 'pending' },
    });

    if (!validation.valid) {
      for (const issue of validation.errors.slice(0, 100)) {
        await recordSyncError(db, syncRunId, issue.type, issue.message, false, { sheet_name: issue.sheet, source_row: issue.row || undefined });
      }
      const errorPreview = validation.errors.slice(0, 10)
        .map((issue) => `${issue.sheet}${issue.row ? ` row ${issue.row}` : ''}: ${issue.message}`)
        .join(' | ');
      throw new Error(`Validation failed with ${validation.errors.length} critical issue(s); previous published data remains active. ${errorPreview}`);
    }

    await logSyncEvent(db, syncRunId, 'VALIDATION_COMPLETED', 'Imported fee data passed validation', {
      source_record_count: validation.sourceRecordCount,
      valid_record_count: validation.validRecordCount,
    });

    // Update sync run with validated totals.
    await updateSyncRunProgress(db, syncRunId, {
      status: 'running',
      total_rows: validation.validRecordCount,
      current_stage: 'staging',
    });

    // Pre-fetch all IDs for mapping
    const categoryMap = new Map((categories || []).map((c: any) => [c.name.toLowerCase(), c.id]));
    const { data: refreshedCountries, error: refreshedCountriesError } = await db.from('countries').select('id, name');
    if (refreshedCountriesError) throw new Error(`Failed to refresh countries: ${refreshedCountriesError.message}`);
    const countryMap = new Map((refreshedCountries || []).map((c: any) => [c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), c.id]));

    if (classRecords.length) {
      const classRows = classRecords.filter((record) => !record.country).map((record) => ({
        dataset_version_id: datasetVersionId,
        class_number: record.class_number,
        name: record.name,
        official_fee: record.official_fee ?? null,
        attorney_fee: record.attorney_fee ?? null,
        total_fee: record.total_fee ?? null,
        currency: record.currency || 'USD',
        source_sheet: 'Classes',
        source_row: record.source_row,
        source_values: record.source_values,
      }));
      if (classRows.length) {
        const { error: classInsertError } = await db.from('fee_classes').upsert(classRows, { onConflict: 'dataset_version_id,class_number' });
        if (classInsertError) throw new Error(`Failed to save Classes sheet data: ${classInsertError.message}`);
      }
      const classValueRows = classRecords.filter((record) => record.country).map((record) => ({
        dataset_version_id: datasetVersionId,
        country_id: countryMap.get(canonicalCountry(record.country!).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()),
        class_number: record.class_number,
        official_fee: record.official_fee ?? null,
        attorney_fee: record.attorney_fee ?? null,
        total_fee: record.total_fee ?? null,
        currency: record.currency || 'USD',
        source_sheet: 'Classes',
        source_row: record.source_row,
        source_values: record.source_values,
      })).filter((record) => record.country_id);
      const uniqueClassValueRows = Array.from(
        new Map(classValueRows.map((record) => [`${record.country_id}:${record.class_number}`, record])).values()
      );
      if (uniqueClassValueRows.length) {
        for (let offset = 0; offset < uniqueClassValueRows.length; offset += 500) {
          const batch = uniqueClassValueRows.slice(offset, offset + 500);
          const { error: classValueError } = await db.from('fee_class_values').upsert(batch, { onConflict: 'dataset_version_id,country_id,class_number' });
          if (classValueError) throw new Error(`Failed to save country class values: ${classValueError.message}`);
          await updateSyncRunProgress(db, syncRunId, {
            status: 'running',
            current_stage: 'staging',
            current_sheet: CLASS_SHEET,
            current_operation: `Saving Classes values ${Math.min(offset + batch.length, uniqueClassValueRows.length)} of ${uniqueClassValueRows.length}`,
            heartbeat_at: new Date().toISOString(),
          });
        }
      }
      const claimingPriorityByCountry = new Map<string, Record<string, unknown>>();
      for (const record of classRecords) {
        if (!record.country || (record.claiming_priority_official_fee === undefined && record.claiming_priority_attorney_fee === undefined && record.claiming_priority_total_fee === undefined)) continue;
        const countryId = countryMap.get(canonicalCountry(record.country).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
        if (!countryId) continue;
        claimingPriorityByCountry.set(countryId, {
          dataset_version_id: datasetVersionId,
          country_id: countryId,
          official_fee: record.claiming_priority_official_fee ?? null,
          attorney_fee: record.claiming_priority_attorney_fee ?? null,
          total_fee: record.claiming_priority_total_fee ?? null,
          currency: record.currency || 'USD',
          source_sheet: 'Classes',
          source_row: record.source_row,
          source_values: record.source_values,
        });
      }
      const claimingPriorityRows = Array.from(claimingPriorityByCountry.values());
      if (claimingPriorityRows.length) {
        const { error: claimingPriorityError } = await db.from('fee_claiming_priority_values').upsert(claimingPriorityRows, { onConflict: 'dataset_version_id,country_id' });
        if (claimingPriorityError) throw new Error(`Failed to save Claiming Priority values: ${claimingPriorityError.message}`);
      }
    }

    // Create services table entries as needed
    const serviceMap = new Map<string, string>();
    const serviceDefinitions = new Map<string, { category_id: string; name: string }>();
    for (const record of allRecords) {
      const categoryId = categoryMap.get(record.category.toLowerCase());
      if (!categoryId) continue;
      const key = `${categoryId}::${record.service.toLowerCase()}`;
      if (!serviceDefinitions.has(key)) serviceDefinitions.set(key, { category_id: categoryId, name: record.service });
    }

    const { data: existingServices, error: servicesError } = await db
      .from('fee_services')
      .select('id,category_id,name')
      .in('category_id', [...new Set(serviceDefinitions.values())].map(service => service.category_id));
    if (servicesError) throw new Error(`Failed to load fee services: ${servicesError.message}`);

    const existingServiceKeys = new Set<string>();
    for (const service of existingServices || []) {
      const key = `${service.category_id}::${service.name.toLowerCase()}`;
      existingServiceKeys.add(key);
      serviceMap.set(key, service.id);
    }

    const missingServices = [...serviceDefinitions.entries()]
      .filter(([key]) => !existingServiceKeys.has(key))
      .map(([, service]) => service);
    if (missingServices.length > 0) {
      const { data: createdServices, error: createServicesError } = await db
        .from('fee_services')
        .insert(missingServices)
        .select('id,category_id,name');
      if (createServicesError) throw new Error(`Failed to create fee services: ${createServicesError.message}`);
      for (const service of createdServices || []) {
        serviceMap.set(`${service.category_id}::${service.name.toLowerCase()}`, service.id);
      }
    }

    // Batch insert records
    const configuredBatchSize = Number.parseInt(Deno.env.get('FEE_SYNC_BATCH_SIZE') || '50', 10);
    const batchSize = Number.isFinite(configuredBatchSize)
      ? Math.min(Math.max(configuredBatchSize, 1), 500)
      : 50;
    let insertedCount = 0;
    let skippedCount = 0;

    for (let i = resumePosition; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const now = new Date().toISOString();

      await db
        .from('fee_sync_locks')
        .update({
          heartbeat_at: now,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          updated_at: now,
        })
        .eq('id', lockId)
        .is('released_at', null);

      await updateSyncRunProgress(db, syncRunId, {
        status: 'running',
        current_sheet: batch[0]?.source_sheet || 'unknown',
        current_batch: batchNumber,
        total_batches: Math.ceil(allRecords.length / batchSize),
        current_operation: `Processing ${batch[0]?.source_sheet || 'fee'} batch ${batchNumber}`,
        heartbeat_at: now,
        percentage: allRecords.length ? Math.min(92, Math.floor((Math.min(i + batchSize, allRecords.length) / allRecords.length) * 92)) : 0,
        sheet_progress: { ...calculateSheetProgress(allRecords, Math.min(i + batchSize, allRecords.length)), Classes: classRecords.length ? 'complete' : 'pending' },
      });

      const uniqueBatch = Array.from(
        new Map(batch.map((record) => [record.record_key, record])).values()
      );
      skippedCount += batch.length - uniqueBatch.length;
      await logSyncEvent(db, syncRunId, 'BATCH_STARTED', `Processing batch ${batchNumber}`, {
        batch_size: uniqueBatch.length,
      }, { sheet_name: batch[0]?.source_sheet, batch_number: batchNumber });

      // Map records to database IDs and prepare for upsert
      const mappedRecords = uniqueBatch
        .map((record) => {
          const categoryId = categoryMap.get(record.category.toLowerCase());
          const countryId = countryMap.get(record.country.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
          const categoryKey = categoryId || record.category.toLowerCase();
          const serviceId = serviceMap.get(`${categoryKey}::${record.service.toLowerCase()}`);

          if (!categoryId || !countryId || !serviceId) {
            skippedCount++;
            return null;
          }

          return {
            dataset_version_id: datasetVersionId,
            category_id: categoryId,
            country_id: countryId,
            service_id: serviceId,
            record_key: record.record_key,
            region: record.region || null,
            official_fee: record.official_fee ?? null,
            attorney_fee: record.attorney_fee ?? null,
            total_fee: record.total_fee ?? null,
            currency: record.currency || 'USD',
            status: 'active',
            source_sheet: record.source_sheet,
            source_row: record.source_row,
            source_identifier: record.source_identifier,
            source_values: record.source_values,
            imported_at: new Date().toISOString(),
          };
        })
        .filter((r) => r !== null) as any[];

      // Source aliases can resolve to one canonical country after parsing. Deduplicate
      // using the database conflict key so a PostgreSQL batch upsert receives each row once.
      const uniqueMappedRecords = Array.from(
        new Map(mappedRecords.map((record) => [
          `${record.dataset_version_id}:${record.category_id}:${record.country_id}:${record.service_id}`,
          record,
        ])).values()
      );
      skippedCount += mappedRecords.length - uniqueMappedRecords.length;

      if (uniqueMappedRecords.length > 0) {
        await withRetry(
          async () => {
            const { error: upsertError } = await db
              .from('fee_values')
              .upsert(uniqueMappedRecords, { onConflict: 'dataset_version_id,category_id,country_id,service_id' });
            if (upsertError) throw new Error(upsertError.message);
          },
          async (error, attempt) => {
            const message = error instanceof Error ? error.message : String(error);
            await logSyncEvent(db, syncRunId, 'RETRY_SCHEDULED', `Retrying batch ${batchNumber}`, {
              attempt,
              error_message: message,
            }, { sheet_name: batch[0]?.source_sheet, batch_number: batchNumber, severity: 'warning' });
            await recordSyncError(db, syncRunId, 'batch_upsert_retry', message, true, {
              sheet_name: batch[0]?.source_sheet,
              batch_number: batchNumber,
            });
          }
        );
        insertedCount += uniqueMappedRecords.length;
      }

      await updateSyncRunProgress(db, syncRunId, {
        processed_rows: Math.min(i + batchSize, allRecords.length),
        inserted_count: insertedCount,
        skipped_count: skippedCount,
      });

      await saveCheckpoint(
        db,
        syncRunId,
        'all',
        batchNumber,
        Math.ceil(allRecords.length / batchSize),
        Math.min(i + batchSize, allRecords.length),
        allRecords.length,
        { inserted: insertedCount, skipped: skippedCount },
        recoveryAttempts
      );
      await logSyncEvent(db, syncRunId, 'CHECKPOINT_SAVED', `Checkpoint saved for batch ${batchNumber}`, {
        processed_rows: Math.min(i + batchSize, allRecords.length),
      }, { sheet_name: batch[0]?.source_sheet, batch_number: batchNumber });
      await logSyncEvent(db, syncRunId, 'BATCH_COMPLETED', `Batch ${batchNumber} completed`, {
        processed_rows: Math.min(i + batchSize, allRecords.length),
      }, { sheet_name: batch[0]?.source_sheet, batch_number: batchNumber });
    }

    await logSyncEvent(db, syncRunId, 'RECONCILIATION_STARTED', 'Reconciling staged records');
    await updateSyncRunProgress(db, syncRunId, {
      status: 'reconciling',
      current_stage: 'reconciling',
      current_operation: 'Reconciling staged records with validated source data',
      percentage: 97,
    });

    // Reconcile against the same identity enforced by fee_values. Distinct source
    // labels may legitimately normalize to one canonical country and class/service.
    const expectedStagedRecordCount = new Set(allRecords.map((record) => [
      record.category.toLowerCase().trim(),
      record.country.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      record.service.toLowerCase().trim(),
    ].join('::'))).size;
    const collapsedSourceDuplicates = validation.validRecordCount - expectedStagedRecordCount;
    const { count: stagedCount, error: stagedCountError } = await db
      .from('fee_values')
      .select('id', { count: 'exact', head: true })
      .eq('dataset_version_id', datasetVersionId)
      .eq('status', 'active');

    if (stagedCountError) {
      throw new Error(`Reconciliation failed while counting staged records: ${stagedCountError.message}`);
    }

    const reconciliation = {
      source_record_count: validation.sourceRecordCount,
      valid_record_count: validation.validRecordCount,
      expected_staged_record_count: expectedStagedRecordCount,
      collapsed_source_duplicates: collapsedSourceDuplicates,
      staged_record_count: stagedCount || 0,
      inserted_count: insertedCount,
      skipped_count: skippedCount,
      new_count: 0,
      unchanged_count: 0,
      deleted_count: 0,
      mismatch: (stagedCount || 0) !== expectedStagedRecordCount,
    };

    if (previousPublishedVersionId) {
      const [{ data: previousRows }, { data: currentRows }] = await Promise.all([
        db.from('fee_values').select('record_key').eq('dataset_version_id', previousPublishedVersionId).eq('status', 'active'),
        db.from('fee_values').select('record_key').eq('dataset_version_id', datasetVersionId).eq('status', 'active'),
      ]);
      const previousKeys = new Set((previousRows || []).map((row: any) => row.record_key));
      const currentKeys = new Set((currentRows || []).map((row: any) => row.record_key));
      const newCount = [...currentKeys].filter((key) => !previousKeys.has(key)).length;
      const deletedCount = [...previousKeys].filter((key) => !currentKeys.has(key)).length;
      reconciliation.new_count = newCount;
      reconciliation.deleted_count = deletedCount;
      reconciliation.unchanged_count = [...currentKeys].filter((key) => previousKeys.has(key)).length;
    } else {
      reconciliation.new_count = stagedCount || 0;
      reconciliation.deleted_count = 0;
      reconciliation.unchanged_count = 0;
    }

    await db.from('fee_dataset_versions').update({
      status: 'reconciling',
      reconciliation_summary: reconciliation,
      total_records: stagedCount || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', datasetVersionId);

    if (reconciliation.mismatch) {
      throw new Error(`Reconciliation failed: expected ${expectedStagedRecordCount} canonical fee record(s) after ${collapsedSourceDuplicates} source duplicate(s) collapsed, staged dataset has ${stagedCount || 0}; previous published data remains active.`);
    }
    await logSyncEvent(db, syncRunId, 'RECONCILIATION_COMPLETED', 'Staged records passed reconciliation', reconciliation);

    // Publish dataset
    await logSyncEvent(db, syncRunId, 'PUBLISH_STARTED', 'Publishing validated fee dataset', { dataset_version_id: datasetVersionId });
    await updateSyncRunProgress(db, syncRunId, {
      status: 'publishing',
      current_stage: 'publishing',
      percentage: 99,
    });

    // Use RPC function to atomically publish
    const { error: publishError } = await db.rpc('publish_fee_dataset', {
      p_version_id: datasetVersionId,
      p_actor_id: user.id,
    });

    if (publishError) {
      throw new Error(`Failed to publish dataset: ${publishError.message}`);
    }
    await logSyncEvent(db, syncRunId, 'PUBLISH_COMPLETED', 'Fee dataset published atomically', { dataset_version_id: datasetVersionId });

    await updateSyncRunProgress(db, syncRunId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_stage: 'completed',
      percentage: 100,
      sheet_progress: { ...Object.fromEntries(REQUIRED_SHEETS.map((sheet) => [sheet, 'complete'])), Classes: classRecords.length ? 'complete' : 'pending' },
    });

    await logSyncEvent(db, syncRunId, 'SYNC_COMPLETED', 'Synchronization completed successfully', {
      total_records: allRecords.length,
      inserted: insertedCount,
      skipped: skippedCount,
    });

    await db
      .from('fee_sync_locks')
      .update({ released_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lockId)
      .is('released_at', null);

    return new Response(
      JSON.stringify({
        success: true,
        sync_run_id: syncRunId,
        records_processed: allRecords.length,
        dataset_version_id: datasetVersionId,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during sync';
    if (syncRunId) {
      await db.from('fee_sync_runs').update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
        current_stage: 'failed',
        updated_at: new Date().toISOString(),
      }).eq('id', syncRunId);
      await recordSyncError(db, syncRunId, 'sync_failed', message, isRetryableError(error));
      await logSyncEvent(db, syncRunId, 'SYNC_FAILED', 'Synchronization failed; previous published data remains active', {
        error_type: isRetryableError(error) ? 'retryable' : 'non_retryable',
      }, { severity: 'error' });
    }
    if (lockId) {
      await db.from('fee_sync_locks').update({
        released_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', lockId).is('released_at', null);
    }
    if (datasetVersionId) {
      await db.from('fee_dataset_versions').update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      }).eq('id', datasetVersionId).in('status', ['staging', 'validating', 'reconciling']);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
