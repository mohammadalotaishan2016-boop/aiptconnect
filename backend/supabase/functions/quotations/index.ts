import { clientPermissionResponse, actionForRequest } from '../_shared/client-permissions.ts';
import { calculateClassPricing, classTypes, type ClassType, type ClassRate } from '../_shared/quotation-class-pricing.ts';
import { toPlainText } from '../_shared/plain-text.ts';
import { parseSpreadsheetPricing } from '../_shared/spreadsheet-fees.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
const categories = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others'] as const;
type Category = typeof categories[number];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const money = (value: unknown) => Math.round(Math.max(0, Number(value ?? 0) || 0) * 100) / 100;
const categoryOf = (value: unknown): Category => categories.includes(value as Category) ? value as Category : (() => { throw Error('A valid fee category is required.'); })();

async function context(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) throw Object.assign(new Error('Authentication is required.'), { status: 401 });
  const { data: profile } = await db.from('profiles').select('role,client_id,approval_status,account_status').eq('id', user.id).single();
  if (!profile || !['administrator', 'client'].includes(profile.role)) throw Object.assign(new Error('Quotation access is not configured for this account.'), { status: 403 });
  if (profile.role === 'client') {
    if (profile.approval_status !== 'approved' || profile.account_status !== 'active' || !profile.client_id || !user.email) throw Object.assign(new Error('This client account is not approved and linked.'), { status: 403 });
    const { data: client } = await db.from('clients').select('email').eq('id', profile.client_id).is('deleted_at', null).maybeSingle();
    if (!client || client.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) throw Object.assign(new Error('The registered client email does not match this account.'), { status: 403 });
  }
  return { db, user, profile };
}

const listSelect = `id,reference_no,invoice_verification_token,status,approved_at,spreadsheet_revision,vat_rate,vatable,discount,currency,client_matter_ref,invoice_date,subject,total_official_fee,total_attorney_fee,total_other_fee,total_vat,grand_total,created_at,updated_at,client:clients(id,company_name,email,address,country_id),project:projects(id,project_name,aipt_ref_no),primary_country:countries(id,name,abbreviation,flag_url),quotation_items(id,country_id,category,procedure_name,quantity,class_numbers,class_type,class_count,class_pricing_rows,additional_fee_per_class,official_fee,attorney_fee,other_fee,claiming_priority,claiming_priority_fee,state_country_ids,state_fee_total,vat_rate,requirement_ids,country:countries(id,name,abbreviation,flag_url))`;
const publicSelect = `id,reference_no,invoice_verification_token,status,approved_at,vat_rate,vatable,discount,currency,client_matter_ref,invoice_date,subject,total_official_fee,total_attorney_fee,total_other_fee,total_vat,grand_total,client:clients(company_name,address),quotation_items(id,country_id,category,procedure_name,quantity,class_numbers,class_type,class_count,class_pricing_rows,additional_fee_per_class,official_fee,attorney_fee,other_fee,claiming_priority,claiming_priority_fee,state_country_ids,state_fee_total,vat_rate,requirement_ids,country:countries(name,abbreviation))`;

// Validity is anchored to the saved administrator approval, never the PDF generation date.
function withQuotationValidity<T extends { status?: string; approved_at?: string | null }>(quotation: T) {
  const approvedAt = quotation.approved_at ? new Date(quotation.approved_at) : null;
  const validUntil = quotation.status === 'Approved' && approvedAt && Number.isFinite(approvedAt.getTime())
    ? new Date(approvedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  return { ...quotation, valid_until: validUntil };
}

const aripoCountries = new Set(['botswana', 'cape verde', 'eswatini', 'gambia', 'lesotho', 'liberia', 'malawi', 'mozambique', 'namibia', 'sao tome and principe', 'sao tome & principe', 'uganda', 'zimbabwe']);

// PostgREST caps a single response; every lookup must read all pages in a stable order.
async function allRows(query: () => any) {
  const rows: any[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query().range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < size) return { data: rows, error: null };
  }
}

// Return only requirements belonging to the verified quotation, never the full catalog.
async function loadQuotationRequirements(db: any, items: any[]) {
  const countries = [...new Set(items.map(item => item.country_id))];
  if (!countries.length) return [];
  const { data } = await allRows(() => db.from('requirements')
    .select('id,country_id,description,procedures!inner(description,services!inner(service))')
    .in('country_id', countries).is('deleted_at', null).order('id'));
  return data.flatMap((row: any) => {
    const procedure = row.procedures?.description;
    const category = row.procedures?.services?.service;
    const relevant = items.some(item => item.country_id === row.country_id && item.procedure_name === procedure && (!item.category || item.category === category) && (!item.requirement_ids?.length || item.requirement_ids.includes(row.id)));
    return relevant ? [{ id: row.id, country_id: row.country_id, procedure, category, description: toPlainText(row.description) }] : [];
  });
}

function feePricing(row: any) {
  const parse = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
  const official = parse(row.official_fee);
  const attorney = parse(row.attorney_fee);
  const total = parse(row.total_fee);
  const currency = String(row.currency ?? '').trim().toUpperCase();
  if (currency !== 'USD') throw Error('The published fee currency must be USD for this quotation.');
  if (official === null || attorney === null || !Number.isFinite(official) || !Number.isFinite(attorney) || official < 0 || attorney < 0) throw Error('Official and attorney fees must both be provided in the published fee data.');
  if (total !== null && (!Number.isFinite(total) || total < 0 || money(total) < money(official + attorney))) throw Error('The published total is invalid or lower than the official and attorney fees.');
  return { official_fee: money(official), attorney_fee: money(attorney), total_fee: total === null ? money(official + attorney) : money(total), currency };
}

function describeFee(row: any) {
  try { return { ...feePricing(row), available: true, issue: null }; }
  catch (cause) { return { official_fee: row.official_fee, attorney_fee: row.attorney_fee, total_fee: row.total_fee, currency: row.currency, available: false, issue: (cause as Error).message }; }
}

async function loadLookups(db: any, profile: { role: string; client_id?: string | null }) {
  const [{ data: clients, error: clientsError }, { data: projects, error: projectsError }, { data: countries, error: countriesError }, { data: feeCategories, error: categoriesError }, { data: procedures, error: proceduresError }, { data: requirements, error: requirementsError }, { data: services, error: servicesError }, { data: vatRates, error: vatError }] = await Promise.all([
    allRows(() => { let query = db.from('clients').select('id,assigned_id,company_name,email,address,country_id,status').is('deleted_at', null).order('id'); return profile.role === 'client' ? query.eq('id', profile.client_id) : query; }),
    allRows(() => { let query = db.from('projects').select('id,client_id,project_name,aipt_ref_no,country_id,service_id,procedure_id,matter_type').is('deleted_at', null).order('id'); return profile.role === 'client' ? query.eq('client_id', profile.client_id) : query; }),
    allRows(() => db.from('countries').select('id,name,abbreviation,flag_url').is('deleted_at', null).order('name').order('id')),
    allRows(() => db.from('fee_categories').select('id,name').in('name', categories as unknown as string[]).is('deleted_at', null).order('display_order').order('id')),
    allRows(() => db.from('procedures').select('id,description,service_id,services!inner(service)').is('deleted_at', null).order('description').order('id')),
    allRows(() => db.from('requirements').select('id,country_id,procedure_id,description').is('deleted_at', null).order('id')),
    allRows(() => db.from('services').select('id,service,color').is('deleted_at', null).order('service').order('id')),
    allRows(() => db.from('vat_rates').select('id,country_id,vat').is('deleted_at', null).order('id')),
  ]);
  const error = [clientsError, projectsError, countriesError, categoriesError, proceduresError, requirementsError, servicesError, vatError].find(Boolean);
  if (error) throw error;
  const procedureById = new Map((procedures ?? []).map((item: any) => [item.id, item]));
  const { data: sharedWorkbook, error: workbookError } = await db.from('spreadsheet_workbooks')
    .select('workbook,revision,updated_at').eq('id', true).single();
  if (workbookError) throw workbookError;
  const spreadsheetRevision = Number(sharedWorkbook?.revision);
  if (!Number.isSafeInteger(spreadsheetRevision) || spreadsheetRevision < 1) throw Error('The saved fee workbook revision is invalid.');
  const spreadsheetPricing = parseSpreadsheetPricing(sharedWorkbook.workbook, countries ?? [], (procedures ?? []).map((item: any) => ({ name: item.description })));
  const visibleClients = profile.role === 'client'
    ? (clients ?? []).filter((item: any) => item.id === profile.client_id)
    : clients ?? [];
  const visibleProjects = profile.role === 'client'
    ? (projects ?? []).filter((item: any) => item.client_id === profile.client_id)
    : projects ?? [];
  return {
    role: profile.role,
    current_client_id: profile.client_id ?? null,
    clients: visibleClients.sort((a: any, b: any) => a.company_name.localeCompare(b.company_name)),
    spreadsheet_revision: spreadsheetRevision,
    spreadsheet_updated_at: sharedWorkbook.updated_at,
    class_rates: spreadsheetPricing.class_rates,
    services: (services ?? []).map((item: any) => ({ id: item.id, name: item.service, category: '', description: item.service, display_color: item.color })),
    projects: visibleProjects,
    countries: countries ?? [],
    categories: (feeCategories ?? []).filter((item: any) => categories.includes(item.name)),
    procedures: (procedures ?? []).map((item: any) => ({ id: item.id, name: item.description, category: item.services?.service ?? '' })).filter((item: any) => categories.includes(item.category)),
    requirements: (requirements ?? []).map((item: any) => ({ ...item, description: toPlainText(item.description), procedure_id: item.procedure_id ?? null, procedure: procedureById.get(item.procedure_id)?.description ?? null, service_id: procedureById.get(item.procedure_id)?.service_id ?? null })),
    fees: spreadsheetPricing.fees,
    claiming_priority_fees: spreadsheetPricing.claiming_priority_fees,
    state_fees: spreadsheetPricing.state_fees,
    aripo_country_ids: (countries ?? []).filter((item: any) => aripoCountries.has(String(item.name).trim().toLowerCase())).map((item: any) => item.id),
    vat_rates: vatRates ?? [],
  };
}

async function resolveItems(db: any, items: any[], expectedSpreadsheetRevision?: number) {
  if (!Array.isArray(items) || items.length === 0) throw Error('Add at least one service to the quotation.');
  if (!Number.isSafeInteger(expectedSpreadsheetRevision) || (expectedSpreadsheetRevision ?? 0) < 1) throw Error('Refresh quotations to load the saved fee workbook before saving.');
  const { data: sharedWorkbook, error: workbookError } = await db.from('spreadsheet_workbooks')
    .select('workbook,revision').eq('id', true).single();
  if (workbookError) throw workbookError;
  const spreadsheetRevision = Number(sharedWorkbook?.revision);
  if (!Number.isSafeInteger(spreadsheetRevision) || spreadsheetRevision < 1) throw Error('The saved fee workbook revision is invalid.');
  if (spreadsheetRevision !== expectedSpreadsheetRevision) throw Error('The fee workbook changed. Refresh quotations and review the updated fees before saving.');
  const { data: procedureRows, error: procedureError } = await allRows(() => db.from('procedures').select('id,description,services!inner(service)').is('deleted_at', null).order('id'));
  if (procedureError) throw procedureError;
  const procedureByKey = new Map((procedureRows ?? []).map((item: any) => [`${item.services?.service}|${item.description}`, item.id]));
  const requestedCategories = [...new Set(items.map((item: any) => categoryOf(item.category)))];
  const { data: serviceRows, error: serviceError } = await db.from('services').select('id,service').in('service', requestedCategories).is('deleted_at', null);
  if (serviceError) throw serviceError;
  if ((serviceRows ?? []).length !== requestedCategories.length) throw Error('The selected service is no longer available.');
  const { data: vatRates, error: vatError } = await allRows(() => db.from('vat_rates').select('id,country_id,vat').is('deleted_at', null).order('id'));
  if (vatError) throw vatError;
  const vatByCountry = new Map((vatRates ?? []).map((row: any) => [row.country_id, money(row.vat)]));
  const { data: countryRows, error: countryError } = await allRows(() => db.from('countries').select('id,name').is('deleted_at', null).order('name'));
  if (countryError) throw countryError;
  const spreadsheetPricing = parseSpreadsheetPricing(sharedWorkbook.workbook, countryRows ?? [], (procedureRows ?? []).map((item: any) => ({ name: item.description })));
  const classRates = spreadsheetPricing.class_rates;
  const resolved: any[] = [];
  for (const item of items) {
    const category = categoryOf(item.category);
    const countryId = typeof item.country_id === 'string' ? item.country_id : '';
    const procedureName = typeof item.procedure_name === 'string' ? item.procedure_name.trim() : '';
    if (!countryId || !procedureName) throw Error('Each service needs a country and procedure.');
    const matchingFees = spreadsheetPricing.fees.filter((fee) =>
      fee.country_id === countryId && fee.category === category && fee.procedure_name === procedureName,
    );
    if (matchingFees.length > 1) throw Error(`The workbook has multiple rates for ${category}, ${procedureName}, and the selected country.`);
    const fee = matchingFees[0];
    if (!fee) throw Error(`No matching fee found for ${category}, ${procedureName}, and the selected country.`);
    if (!procedureByKey.has(`${category}|${procedureName}`)) throw Error('The selected procedure does not belong to the selected service.');
    let pricing = fee;
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw Error('Quantity must be a whole number between 1 and 1000.');
    const classNumbers = category === 'Trademark' && Array.isArray(item.class_numbers)
      ? [...new Set(item.class_numbers.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value >= 1 && value <= 45))]
      : [];
    if (category === 'Trademark' && Array.isArray(item.class_numbers) && classNumbers.length !== item.class_numbers.length) throw Error('Trademark classes must be whole numbers from 1 to 45.');
    // Legacy Single/Multi rows retain per-mark pricing when edited and saved.
    const requestedClassType = item.class_type;
    const usesLegacyClassType = requestedClassType == null || ['Single', 'Multi'].includes(requestedClassType);
    if (category === 'Trademark' && usesLegacyClassType) throw Error('Select a type of class before saving the quotation.');
    const classType: ClassType | null = category === 'Trademark'
      ? (usesLegacyClassType ? 'Per mark per class' : requestedClassType)
      : null;
    if (category === 'Trademark' && !classTypes.includes(classType as ClassType)) throw Error('Select a valid type of class.');
    const classCount = category === 'Trademark' ? Number(classTypes.includes(requestedClassType) ? item.class_count : item.class_count || classNumbers.length || 1) : 0;
    if (classNumbers.length && classNumbers.length !== classCount) throw Error('Optional trademark class numbers must match the number of classes.');
    const breakdown = classType ? calculateClassPricing(pricing, countryId, classType, classCount, classRates) : null;
    pricing = breakdown ? { ...breakdown, currency: 'USD', available: true, issue: null } : describeFee(fee);
    if (!breakdown) feePricing(fee);
    const classMultiplier = category === 'Trademark' ? classCount : 1;
    const total = pricing.total_fee;
    const claimingPriority = category === 'Trademark' && item.claiming_priority === true;
    let claimingPriorityFee = 0;
    if (claimingPriority) {
      const priorityRows = spreadsheetPricing.claiming_priority_fees.filter((row) => row.country_id === countryId);
      const priority = priorityRows[0];
      if (!priority) throw Error('Claiming Priority is not available for the selected country.');
      claimingPriorityFee = feePricing(priority).total_fee;
    }
    const stateCountryIds = category === 'Trademark' && Array.isArray(item.state_country_ids)
      ? [...new Set(item.state_country_ids.filter((value: unknown): value is string => typeof value === 'string'))]
      : [];
    let stateFeeTotal = 0;
    if (stateCountryIds.length) {
      const { data: stateCountries, error: stateCountriesError } = await db.from('countries').select('id,name').in('id', stateCountryIds).is('deleted_at', null);
      if (stateCountriesError) throw stateCountriesError;
      if ((stateCountries ?? []).length !== stateCountryIds.length || (stateCountries ?? []).some((state: any) => !aripoCountries.has(String(state.name).trim().toLowerCase()))) throw Error('States can only be selected from ARIPO countries.');
      const stateFees = spreadsheetPricing.state_fees.filter((row) => stateCountryIds.includes(row.country_id));
      if (stateFees.length !== stateCountryIds.length) throw Error('A States fee is not available for every selected ARIPO country in the workbook.');
      stateFeeTotal = money(stateFees.reduce((sum, row) => sum + feePricing(row).total_fee, 0));
    }
    const additional = 0;
    const requirementIds = Array.isArray(item.requirement_ids) ? item.requirement_ids.filter((id: unknown) => typeof id === 'string') : [];
    if (requirementIds.length) {
      const procedureId = procedureByKey.get(`${category}|${procedureName}`);
      const { data: requirements, error: requirementsError } = procedureId
        ? await db.from('requirements').select('id,procedure_id').in('id', requirementIds).eq('country_id', countryId).eq('procedure_id', procedureId).is('deleted_at', null)
        : { data: [], error: null };
      if (requirementsError) throw requirementsError;
      if ((requirements ?? []).length !== requirementIds.length) throw Error('A selected requirement does not match the selected procedure and country.');
    }
    const vatRate = vatByCountry.get(countryId) ?? 0;
    const official = money(pricing.official_fee * quantity);
    const attorney = money(pricing.attorney_fee * quantity);
    const other = money(Math.max(0, total * quantity - official - attorney));
    resolved.push({ country_id: countryId, category, procedure_name: procedureName, fee_value_id: null, quantity, class_numbers: classNumbers, class_type: classType, class_count: classCount, class_pricing_rows: breakdown?.rows ?? [], additional_fee_per_class: 0, official_fee: official, attorney_fee: attorney, other_fee: other, vat_rate: vatRate, requirement_ids: requirementIds, claiming_priority: claimingPriority, claiming_priority_fee: money(claimingPriorityFee * quantity * classMultiplier), state_country_ids: stateCountryIds, state_fee_total: money(stateFeeTotal * quantity * classMultiplier), vat: attorney * vatRate / 100 });
  }
  return { items: resolved, spreadsheetRevision };
}

function totals(items: any[], discount: number, vatRate: number) {
  const official = money(items.reduce((sum, item) => sum + item.official_fee, 0));
  const attorney = money(items.reduce((sum, item) => sum + item.attorney_fee, 0));
  const other = money(items.reduce((sum, item) => sum + item.other_fee + item.claiming_priority_fee + item.state_fee_total, 0));
  const vat = money(items.reduce((sum, item) => sum + item.attorney_fee * item.vat_rate / 100, 0));
  return { official, attorney, other, vat, grand: money(Math.max(0, official + attorney + other + vat - discount)) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  try {
    const publicUrl = new URL(request.url);
    const publicParts = publicUrl.pathname.split('/').filter(Boolean);
    const verificationIndex = publicParts.indexOf('verify');
    if (request.method === 'GET' && verificationIndex >= 0 && publicParts[verificationIndex + 1]) {
      const token = publicParts[verificationIndex + 1];
      if (!/^(?:[a-f0-9]{48}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(token)) return json({ error: 'Invoice verification record not found.' }, 404);
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const lookup = token.includes('-') ? db.from('quotations').select(publicSelect).eq('id', token) : db.from('quotations').select(publicSelect).eq('invoice_verification_token', token);
      const { data, error } = await lookup.eq('status', 'Approved').is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'Invoice verification record not found.' }, 404);
      return json({ ...withQuotationValidity(data), requirements: await loadQuotationRequirements(db, data.quotation_items ?? []) });
    }
    const { db, user, profile } = await context(request);
    const denied = await clientPermissionResponse(db, user.id, request.method === 'GET' && new URL(request.url).searchParams.get('lookup') === 'true' && new URL(request.url).searchParams.get('permission_page') === 'fees' ? 'fees' : request.method === 'GET' && new URL(request.url).searchParams.get('status') === 'Approved' ? 'invoices' : 'quotations', new URL(request.url).pathname.endsWith('/cancel') ? 'update' : actionForRequest(request), cors); if (denied) return denied;
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1);
    const isApproval = last === 'approve';
    const isCancellation = last === 'cancel';
    const resourcePart = isApproval || isCancellation ? parts.at(-2) : last;
    const id = resourcePart === 'quotations' ? null : resourcePart;
    if (request.method === 'GET' && url.searchParams.get('lookup') === 'true') { const lookups = await loadLookups(db, profile); return json(url.searchParams.get('permission_page') === 'fees' ? { countries:lookups.countries, fees:lookups.fees } : lookups); }
    if (request.method === 'GET' && url.searchParams.get('next_reference') === 'true') {
      const category = categoryOf(url.searchParams.get('category'));
      const countryIds = (url.searchParams.get('country_ids') ?? '').split(',').filter(Boolean);
      if (!countryIds.length) return json({ reference: null });
      const prefix = category === 'Trademark' ? 'T' : category === 'Patent' ? 'P' : category === 'Design' ? 'D' : category === 'Copyright' ? 'C' : 'O';
      const { data: countries, error: countriesError } = await db.from('countries').select('id,abbreviation').in('id', countryIds).is('deleted_at', null);
      if (countriesError) throw countriesError;
      if (!countries?.length || countries.length !== countryIds.length) throw Error('One or more selected countries are invalid.');
      const referenceYear = new Date().getUTCFullYear();
      const { data: counter, error: counterError } = await db.from('quotation_reference_counters').select('next_sequence').eq('reference_year', referenceYear).eq('category_prefix', prefix).maybeSingle();
      if (counterError) throw counterError;
      const sequence = counter?.next_sequence ?? 6001;
      const abbreviation = countries.length > 1 ? 'INT' : String(countries[0].abbreviation).toUpperCase();
      return json({ reference: `${prefix}-${referenceYear}-${sequence}-${abbreviation}` });
    }
    if (request.method === 'GET') {
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? 10)));
      const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
      const status = url.searchParams.get('status');
      const sortFields = ['created_at', 'reference_no', 'grand_total', 'status', 'invoice_date'];
      const sort = sortFields.includes(url.searchParams.get('sort') ?? '') ? url.searchParams.get('sort')! : 'created_at';
      const country = url.searchParams.get('country_id');
      // Use database pagination for the common unfiltered list; avoid loading every quotation.
      if (!search && !country) {
        let query = db.from('quotations').select(listSelect, { count: 'exact' }).is('deleted_at', null).order(sort, { ascending: url.searchParams.get('direction') === 'asc' }).order('id');
        if (profile.role === 'client') query = query.eq('client_id', profile.client_id);
        if (status) query = query.eq('status', status);
        const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
        if (error) throw error;
        return json({ data: (data ?? []).map(withQuotationValidity), total: count ?? 0, page, page_size: pageSize });
      }
      const { data, error } = await allRows(() => {
        let query = db.from('quotations').select(listSelect).is('deleted_at', null).order(sort, { ascending: url.searchParams.get('direction') === 'asc' }).order('id');
        if (profile.role === 'client') query = query.eq('client_id', profile.client_id);
        if (status) query = query.eq('status', status);
        return query;
      });
      if (error) throw error;
      const filtered = (data ?? []).filter((item: any) => (!country || item.quotation_items?.some((row: any) => row.country_id === country)) && (!search || JSON.stringify(item).toLowerCase().includes(search)));
      return json({ data: filtered.slice((page - 1) * pageSize, page * pageSize).map(withQuotationValidity), total: filtered.length, page, page_size: pageSize });
    }
    if (profile.role !== 'administrator' && !(profile.role === 'client' && ['POST', 'PUT', 'DELETE'].includes(request.method))) return json({ error: 'Only administrators can manage quotations.' }, 403);
    if (request.method === 'POST' && isApproval) {
      if (profile.role !== 'administrator') return json({ error: 'Only administrators can approve quotations.' }, 403);
      if (!id) throw Error('Quotation id is required.');
      const { data: existing } = await db.from('quotations').select('id,status').eq('id', id).is('deleted_at', null).maybeSingle();
      if (!existing) return json({ error: 'Quotation not found.' }, 404);
      if (existing.status !== 'Pending Approval') throw Error('Only pending quotations can be approved.');
      const result = await db.from('quotations').update({ status: 'Approved', approved_by: user.id, approved_at: new Date().toISOString() }).eq('id', id).eq('status', 'Pending Approval').is('deleted_at', null).select(listSelect).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: 'Quotation status changed. Refresh and try again.' }, 409);
      return json(withQuotationValidity(result.data));
    }
    if (request.method === 'POST' && last === 'cancel') {
      if (!id) throw Error('Quotation id is required.');
      let cancelQuery = db.from('quotations').select('id,status,client_id').eq('id', id).is('deleted_at', null);
      if (profile.role === 'client') cancelQuery = cancelQuery.eq('client_id', profile.client_id);
      const { data: existing, error: existingError } = await cancelQuery.maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return json({ error: 'Quotation not found.' }, 404);
      if (['Approved', 'Posted', 'Cancelled'].includes(existing.status)) throw Error('This quotation cannot be cancelled.');
      const result = await db.from('quotations').update({ status: 'Cancelled' }).eq('id', id).select(listSelect).single();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: 'Quotation status changed. Refresh and try again.' }, 409);
      return json(withQuotationValidity(result.data));
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      const vatable = body.vatable !== false;
      const discount = money(body.discount);
      const { items, spreadsheetRevision } = await resolveItems(db, body.items, Number(body.spreadsheet_revision));
      if (!vatable) items.forEach((item) => { item.vat_rate = 0; });
      const vatRate = items.length ? items[0].vat_rate : 0;
      const summary = totals(items, discount, vatRate);
      const first = items[0];
      const clientId = profile.role === 'client'
        ? profile.client_id || ''
        : typeof body.client_id === 'string' ? body.client_id : '';
      if (!clientId) throw Error('A client is required.');
      const { data: client } = await db.from('clients').select('id').eq('id', clientId).is('deleted_at', null).maybeSingle();
      if (!client) throw Error('The selected client no longer exists.');
      if (body.project_id) {
        const { data: project } = await db.from('projects').select('id,client_id').eq('id', body.project_id).eq('client_id', clientId).is('deleted_at', null).maybeSingle();
        if (!project) throw Error('The inquiry project does not belong to the selected client.');
      }
      const payload = { client_id: clientId, project_id: body.project_id || null, primary_category: first.category, primary_country_id: first.country_id, spreadsheet_revision: spreadsheetRevision, client_matter_ref: typeof body.client_matter_ref === 'string' ? body.client_matter_ref.trim() : null, invoice_date: typeof body.invoice_date === 'string' && body.invoice_date ? body.invoice_date : new Date().toISOString().slice(0, 10), subject: typeof body.subject === 'string' ? body.subject.trim() : '', currency: 'USD', vatable, vat_rate: vatRate, discount, total_official_fee: summary.official, total_attorney_fee: summary.attorney, total_other_fee: summary.other, total_vat: summary.vat, grand_total: summary.grand };
      if (request.method === 'PUT' && profile.role === 'client') {
        if (!id) throw Error('Quotation id is required.');
        const itemRows = items.map(({ vat, ...item }) => item);
        const result = await db.rpc('edit_pending_client_quotation', {
          p_quotation_id: id, p_client_id: clientId, p_payload: payload, p_items: itemRows,
        });
        if (result.error) {
          if (result.error.code === '42501') return json({ error: 'Quotation not found for this client.' }, 403);
          if (result.error.code === '23514') return json({ error: result.error.message }, 409);
          throw result.error;
        }
        return json({ ...result.data, ...payload, items: itemRows }, 200);
      }
      let quotation: any;
      if (request.method === 'POST') {
        const result = await db.from('quotations').insert({ ...payload, created_by: user.id, status: 'Pending Approval' }).select('id,reference_no,invoice_verification_token').single();
        if (result.error) throw result.error;
        quotation = result.data;
      } else {
        if (!id) throw Error('Quotation id is required.');
        const { data: existing } = await db.from('quotations').select('id,reference_no,status').eq('id', id).is('deleted_at', null).maybeSingle();
        if (!existing) throw Error('Quotation not found.');
        if (existing.status === 'Approved' || existing.status === 'Posted') throw Error('Approved or posted quotations cannot be edited.');
        const result = await db.from('quotations').update(payload).eq('id', id).select('id,reference_no,invoice_verification_token').single();
        if (result.error) throw result.error;
        quotation = result.data;
        await db.from('quotation_items').delete().eq('quotation_id', id);
      }
      const itemRows = items.map(({ vat, ...item }) => ({ ...item, quotation_id: quotation.id }));
      const inserted = await db.from('quotation_items').insert(itemRows);
      if (inserted.error) {
        if (request.method === 'POST') await db.from('quotations').delete().eq('id', quotation.id);
        throw inserted.error;
      }
      return json({ ...quotation, ...payload, items: itemRows }, request.method === 'POST' ? 201 : 200);
    }
    if (!id) throw Error('Quotation id is required.');
    let deletionQuery = db.from('quotations').select('id,status').eq('id', id).is('deleted_at', null);
    if (profile.role === 'client') deletionQuery = deletionQuery.eq('client_id', profile.client_id);
    const { data: existing, error: deletionError } = await deletionQuery.maybeSingle();
    if (deletionError) throw deletionError;
    if (!existing) return json({ error: 'Quotation not found.' }, 404);
    if (profile.role === 'client' && existing.status !== 'Pending Approval') return json({ error: 'Only pending quotations can be deleted.' }, 409);
    if (request.method === 'DELETE') {
      let deleteQuery = db.from('quotations').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (profile.role === 'client') deleteQuery = deleteQuery.eq('client_id',profile.client_id).eq('status','Pending Approval');
      const result = await deleteQuery.select('id').maybeSingle();
      if (!result.error && !result.data) return json({ error:'Quotation changed. Refresh and try again.' },409);
      if (result.error) throw result.error;
      return new Response(null, { status: 204, headers: cors });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const error = cause as Error & { status?: number };
    return json({ error: error.message || 'Quotation request failed.' }, error.status ?? 400);
  }
});
