// Lightweight Fees API
// - Server-side pagination (cursor-based)
// - Lazy-loading per category
// - Search and filtering
// - Cache support
// - Reads only from PUBLISHED dataset versions

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};
const MAX_CLASS_NUMBER = 45;

interface FeeRow {
  id: string;
  category: string;
  country: string;
  region?: string;
  service: string;
  official_fee?: number;
  attorney_fee?: number;
  total_fee?: number;
  currency?: string;
  flag_url?: string;
}

interface ClassRow {
  id: string;
  class_number: number;
  name: string;
  official_fee?: number;
  attorney_fee?: number;
  total_fee?: number;
  currency?: string;
}

type ClassMatrixRow = {
  id: string;
  country: string;
  flag_url?: string;
  claiming_priority?: ClassFee;
  [key: `class_${number}`]: ClassFee | string | number | undefined;
};

type ClassFee = {
  official_fee?: number;
  attorney_fee?: number;
  total_fee?: number;
  currency?: string;
};

interface PaginationResponse {
  data: FeeRow[];
  available_categories: string[];
  next_cursor?: string;
  prev_cursor?: string;
  total_count?: number;
  page_info: {
    page_size: number;
    has_next: boolean;
    has_prev: boolean;
    current_position: number;
  };
}

function parseQueryParams(url: string) {
  const u = new URL(url);
  return {
    category: u.searchParams.get('category')?.trim() || 'Trademark',
    limit: Math.min(100, parseInt(u.searchParams.get('limit') || '50')),
    cursor: u.searchParams.get('cursor'),
    search: u.searchParams.get('search') || '',
    country: u.searchParams.get('country') || '',
    service: u.searchParams.get('service') || '',
  };
}

function decodeCursor(cursor: string | null): { offset: number; timestamp: number } {
  if (!cursor) return { offset: 0, timestamp: Date.now() };
  try {
    const decoded = atob(cursor);
    const [offset, timestamp] = decoded.split(':').map(Number);
    return { offset: offset || 0, timestamp: timestamp || Date.now() };
  } catch {
    return { offset: 0, timestamp: Date.now() };
  }
}

function encodeCursor(offset: number, timestamp: number = Date.now()): string {
  return btoa(`${offset}:${timestamp}`);
}

async function cachedJson(request: Request, body: unknown, version: number) {
  const query = [...new URL(request.url).searchParams.entries()]
    .filter(([key]) => key !== 'perf_probe')
    .sort(([left], [right]) => left.localeCompare(right));
  const key = JSON.stringify([version, query]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const etag = `"fees-v${version}-${hash}"`;
  const headers = {
    ...cors,
    'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
    ETag: etag,
  };
  return new Response(JSON.stringify(body), { status: 200, headers });
}

Deno.serve(async (request: Request) => {
  // CORS - Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: cors 
    });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: cors 
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration missing' }),
      { status: 500, headers: cors }
    );
  }

  try {
    const db = createClient(supabaseUrl, serviceRoleKey);
    const query = parseQueryParams(request.url);
    const { offset } = decodeCursor(query.cursor);

    // Try to get latest published dataset version
    const { data: latestVersion, error: versionError } = await db
      .from('fee_dataset_versions')
      .select('id, version_number')
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError) {
      console.error('Dataset version lookup error:', versionError);
      return new Response(
        JSON.stringify({ error: 'Failed to check fee data availability' }),
        { status: 500, headers: cors }
      );
    }

    // If no published version exists, return empty data with helpful message
    if (!latestVersion) {
      return new Response(
        JSON.stringify({
          data: [],
          available_categories: [],
          page_info: { page_size: 0, has_next: false, has_prev: false, current_position: 0 },
          message: 'No fee data available yet. Please run a sync from the Admin Dashboard to load fees from Google Sheets.',
          status: 'no_data',
          action: 'admin_sync_required',
        }),
        { status: 200, headers: cors }
      );
    }

    const { data: categories, error: categoriesError } = await db
      .from('fee_categories')
      .select('id, name')
      .eq('is_primary', true)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (categoriesError) {
      console.error('Category lookup error:', categoriesError);
      return new Response(
        JSON.stringify({ error: 'Failed to load fee categories' }),
        { status: 500, headers: cors }
      );
    }

    if (query.category.toLowerCase() === 'classes') {
      const [{ data: classes, error: classesError }, { data: countryFees, error: countryFeesError }, { data: claimingPriorityValues, error: claimingPriorityError }] = await Promise.all([
        db
        .from('fee_classes')
        .select('id,class_number,name,official_fee,attorney_fee,total_fee,currency')
        .eq('dataset_version_id', latestVersion.id)
        .gte('class_number', 1)
        .lte('class_number', MAX_CLASS_NUMBER)
        .order('class_number'),
        db
          .from('fee_values')
          .select('countries(id,name,flag_url)')
          .eq('dataset_version_id', latestVersion.id)
          .eq('status', 'active')
          .limit(5000),
        db
          .from('fee_claiming_priority_values')
          .select('country_id,official_fee,attorney_fee,total_fee,currency,countries(id,name,flag_url)')
          .eq('dataset_version_id', latestVersion.id),
      ]);
      if (classesError) throw classesError;
      if (countryFeesError) throw countryFeesError;
      if (claimingPriorityError) throw claimingPriorityError;

      const classValuePages = await Promise.all(Array.from({ length: 12 }, (_, page) => db
        .from('fee_class_values')
        .select('country_id,class_number,official_fee,attorney_fee,total_fee,currency,countries(id,name,flag_url)')
        .eq('dataset_version_id', latestVersion.id)
        .gte('class_number', 1)
        .lte('class_number', MAX_CLASS_NUMBER)
        .range(page * 1000, page * 1000 + 999)));
      const classValues = classValuePages.flatMap((page) => {
        if (page.error) throw page.error;
        return page.data || [];
      });

      const classRows = (classes || []) as ClassRow[];
      const classByNumber = new Map(classRows.map((item) => [item.class_number, item]));
      const valuesByCountry = new Map<string, Map<number, ClassFee>>();
      const claimingPriorityByCountry = new Map<string, ClassFee>();
      const countriesById = new Map<string, { name: string; flag_url?: string }>();
      for (const value of classValues || []) {
        const relatedCountry = (value as any).countries;
        const country = Array.isArray(relatedCountry) ? relatedCountry[0] : relatedCountry;
        if (country?.id && country.name) countriesById.set(country.id, country);
        if (value.total_fee === null && value.official_fee === null && value.attorney_fee === null) continue;
        if (!valuesByCountry.has(value.country_id)) valuesByCountry.set(value.country_id, new Map());
        valuesByCountry.get(value.country_id)!.set(value.class_number, {
          official_fee: value.official_fee ?? undefined,
          attorney_fee: value.attorney_fee ?? undefined,
          total_fee: value.total_fee ?? undefined,
          currency: value.currency || 'USD',
        });
      }
      for (const row of countryFees || []) {
        const relatedCountry = (row as any).countries;
        const country = Array.isArray(relatedCountry) ? relatedCountry[0] : relatedCountry;
        if (country?.id && country.name) countriesById.set(country.id, country);
      }
      for (const value of claimingPriorityValues || []) {
        const relatedCountry = (value as any).countries;
        const country = Array.isArray(relatedCountry) ? relatedCountry[0] : relatedCountry;
        if (country?.id && country.name) {
          countriesById.set(country.id, country);
          claimingPriorityByCountry.set(country.id, {
            official_fee: value.official_fee ?? undefined,
            attorney_fee: value.attorney_fee ?? undefined,
            total_fee: value.total_fee ?? undefined,
            currency: value.currency || 'USD',
          });
        }
      }

      const search = query.search.toLowerCase();
      const filtered = [...countriesById.values()]
        .filter((country) => !query.country || country.name.toLowerCase().includes(query.country.toLowerCase()))
        .map((country) => {
          const row: ClassMatrixRow = { id: country.name, country: country.name, flag_url: country.flag_url };
          const countryValues = valuesByCountry.get((country as any).id);
          for (let classNumber = 1; classNumber <= MAX_CLASS_NUMBER; classNumber += 1) {
            const classValue = countryValues?.get(classNumber);
            const classRow = classByNumber.get(classNumber);
            row[`class_${classNumber}`] = classValue ?? classRow?.name ?? '-';
          }
          row.claiming_priority = claimingPriorityByCountry.get((country as any).id);
          return row;
        })
        .filter((row) => !search || Object.values(row).some((value) => String(value || '').toLowerCase().includes(search)));
      return cachedJson(request, { data: filtered, available_categories: [...(categories || []).map((item) => item.name), 'Classes'], page_info: { page_size: filtered.length, has_next: false, has_prev: false, current_position: 0 }, total_count: filtered.length }, latestVersion.version_number);
    }

    const categoryAvailability = await Promise.all(
      (categories || []).map(async category => {
        const { data, error } = await db
          .from('fee_values')
          .select('category_id')
          .eq('dataset_version_id', latestVersion.id)
          .eq('status', 'active')
          .eq('category_id', category.id)
          .limit(1)
          .maybeSingle();

        return { category, isAvailable: !error && Boolean(data) };
      })
    );
    const availableCategories = categoryAvailability
      .filter(({ isAvailable }) => isAvailable)
      .map(({ category }) => category.name);
    const requestedCategory = (categories || []).find(
      category => category.name.toLowerCase() === query.category.toLowerCase()
    );

    const matrixCategoryLimits: Record<string, number> = {
      'up to 5 classes': MAX_CLASS_NUMBER,
      'up to 3 classes': MAX_CLASS_NUMBER,
      'multi-class': MAX_CLASS_NUMBER,
    };
    const matrixLimit = matrixCategoryLimits[query.category.toLowerCase()];
    if (requestedCategory && Object.prototype.hasOwnProperty.call(matrixCategoryLimits, query.category.toLowerCase())) {
      const { data: matrixValues, error: matrixValuesError } = await db
        .from('fee_values')
        .select('country_id,official_fee,attorney_fee,total_fee,currency,countries(id,name,flag_url),fee_services(name)')
        .eq('dataset_version_id', latestVersion.id)
        .eq('status', 'active')
        .eq('category_id', requestedCategory.id)
        .limit(5000);
      if (matrixValuesError) throw matrixValuesError;

      const valuesByCountry = new Map<string, Map<number, ClassFee>>();
      const countriesById = new Map<string, { id: string; name: string; flag_url?: string }>();
      const classNumbers = new Set<number>();
      for (const value of matrixValues || []) {
        const country = Array.isArray((value as any).countries) ? (value as any).countries[0] : (value as any).countries;
        const service = Array.isArray((value as any).fee_services) ? (value as any).fee_services[0] : (value as any).fee_services;
        const match = String(service?.name || '').match(/^class\s*(\d{1,2})$/i);
        if (!country?.id || !country.name || !match) continue;
        const classNumber = Number(match[1]);
        if (!Number.isInteger(classNumber) || classNumber < 1 || (matrixLimit && classNumber > matrixLimit)) continue;
        countriesById.set(country.id, country);
        classNumbers.add(classNumber);
        if (!valuesByCountry.has(country.id)) valuesByCountry.set(country.id, new Map());
        valuesByCountry.get(country.id)!.set(classNumber, {
          official_fee: value.official_fee ?? undefined,
          attorney_fee: value.attorney_fee ?? undefined,
          total_fee: value.total_fee ?? undefined,
          currency: value.currency || 'USD',
        });
      }
      const displayedClassNumbers = Array.from({ length: matrixLimit }, (_, index) => index + 1);
      const search = query.search.toLowerCase();
      const data = [...countriesById.values()]
        .filter((country) => !query.country || country.name.toLowerCase().includes(query.country.toLowerCase()))
        .map((country) => {
          const row: ClassMatrixRow = { id: country.id, country: country.name, flag_url: country.flag_url };
          for (const classNumber of displayedClassNumbers) row[`class_${classNumber}`] = valuesByCountry.get(country.id)?.get(classNumber);
          return row;
        })
        .filter((row) => !search || Object.values(row).some((value) => String(value || '').toLowerCase().includes(search)));
      return cachedJson(request, { data, class_numbers: displayedClassNumbers, available_categories: availableCategories, page_info: { page_size: data.length, has_next: false, has_prev: false, current_position: 0 }, total_count: data.length }, latestVersion.version_number);
    }
    // Build base query
    let q = db
      .from('fee_values')
      .select(
        `
        id,
        category_id,
        country_id,
        service_id,
        region,
        official_fee,
        attorney_fee,
        total_fee,
        currency,
        fee_categories(name),
        countries(name, abbreviation, flag_url),
        fee_services(name)
      `,
        { count: 'exact' }
      )
      .eq('dataset_version_id', latestVersion.id)
      .eq('status', 'active');

    // Filter by category
    if (requestedCategory) {
      q = q.eq('category_id', requestedCategory.id);
    } else {
      q = q.eq('category_id', '00000000-0000-0000-0000-000000000000');
    }

    // Filter by country
    if (query.country) {
      q = q.ilike('countries.name', `%${query.country}%`);
    }

    // Filter by service
    if (query.service) {
      q = q.ilike('fee_services.name', `%${query.service}%`);
    }

    // Full text search
    if (query.search) {
      const searchTerm = `%${query.search}%`;
      q = q.or(`countries.name.ilike.${searchTerm},fee_services.name.ilike.${searchTerm}`);
    }

    // Pagination
    const { data, error, count } = await q
      .order('countries(name)', { ascending: true })
      .order('fee_services(name)', { ascending: true })
      .range(offset, offset + query.limit - 1);

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch fee data' }),
        { status: 400, headers: cors }
      );
    }

    // Transform response
    const transformedData: FeeRow[] = (data || []).map((row: any) => ({
      id: row.id,
      category: row.fee_categories?.name || '',
      country: row.countries?.name || '',
      region: row.region || undefined,
      service: row.fee_services?.name || '',
      official_fee: row.official_fee,
      attorney_fee: row.attorney_fee,
      total_fee: row.total_fee,
      currency: row.currency || 'USD',
      flag_url: row.countries?.flag_url,
    }));

    const response: PaginationResponse = {
      data: transformedData,
      available_categories: availableCategories,
      page_info: {
        page_size: query.limit,
        has_next: (count || 0) > offset + query.limit,
        has_prev: offset > 0,
        current_position: offset,
      },
    };

    // Add cursors if there are more results
    if (response.page_info.has_next) {
      response.next_cursor = encodeCursor(offset + query.limit);
    }
    if (response.page_info.has_prev) {
      response.prev_cursor = encodeCursor(Math.max(0, offset - query.limit));
    }

    return cachedJson(request, response, latestVersion.version_number);
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected server error',
      }),
      { status: 500, headers: cors }
    );
  }
});
