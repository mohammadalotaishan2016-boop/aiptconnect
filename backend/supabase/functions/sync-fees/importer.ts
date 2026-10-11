export interface ParsedFeeRecord {
  category: string;
  country: string;
  region?: string;
  service: string;
  official_fee?: number;
  attorney_fee?: number;
  total_fee?: number;
  currency?: string;
  source_sheet: string;
  source_row: number;
  source_identifier: string;
  record_key: string;
  source_values: string[];
}

export interface ParsedClassRecord {
  class_number: number;
  name: string;
  country?: string;
  official_fee?: number;
  attorney_fee?: number;
  total_fee?: number;
  claiming_priority_official_fee?: number;
  claiming_priority_attorney_fee?: number;
  claiming_priority_total_fee?: number;
  currency?: string;
  source_row: number;
  source_values: string[];
}

export interface ImportIssue {
  sheet: string;
  row: number;
  type: 'missing_country' | 'missing_service' | 'invalid_fee' | 'duplicate' | 'unrecognized_structure';
  message: string;
}

export interface SheetImportResult {
  records: ParsedFeeRecord[];
  issues: ImportIssue[];
  header_rows: number[];
}

type ColumnGroup = {
  service: string;
  officialIndex: number;
  attorneyIndex: number;
  totalIndex: number;
  currencyIndex: number;
};

const COUNTRY_HEADERS = ['country', 'countries', 'jurisdiction', 'territory', 'country name'];
const REGION_HEADERS = ['region', 'regions', 'area', 'territory'];
const FEE_HEADERS = ['official', 'government', 'attorney', 'atty', 'total', 'fee', 'cost', 'price'];
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'AED', 'INR', 'ZAR'];

function cell(value: string | undefined): string {
  return (value || '').replace(/\u00a0/g, ' ').trim();
}

function normalized(value: string): string {
  return cell(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function canonicalCountry(value: string): string {
  const rawName = cell(value);
  const baseName = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // Sheets label some jurisdictions by office/territory (for example Iraq – (Baghdad)).
  // Match the canonical country after removing the annotation and any Unicode dash.
  const cleanedName = baseName.replace(/[\s\u2013\u2014-]+$/, '').trim();
  // Accept the published spelling plus legacy mojibake variants from CSV/Sheets exports.
  // Comparing the ASCII signature handles bad UTF-8 without changing other country names.
  const countrySignature = rawName.toLowerCase().replace(/[^a-z]/g, '');
  if (/^s.*tom.*pr.*ncipe$/.test(countrySignature)) return 'Sao Tome and Principe';
  const aliases: Record<string, string> = {
    'Bonaire, Sint Eustatius and Saba': 'Bonaire',
    'Brunei Darussalam': 'Brunei',
    'Cabo Verde': 'Cape Verde',
    'Cocos (Keeling) Islands': 'Cocos [Keeling] Islands',
    'Curaçao': 'Curacao',
    'Czechia': 'Czech Republic',
    "Côte d'Ivoire": 'Ivory Coast',
    Eswatini: 'Swaziland',
    'Falkland Islands (the) [Malvinas]': 'Falkland Islands',
    'Holy See': 'Vatican City',
    Korea: 'South Korea',
    "Lao People's Democratic Republic": 'Laos',
    Myanmar: 'Myanmar [Burma]',
    'North Macedonia': 'Macedonia',
    'Palestine, State of': 'Palestine',
    'Palestine-': 'Palestine',
    'UAE': 'United Arab Emirates',
    'Sao Tome & Principe': 'SÃ£o TomÃ© and PrÃncipe',
    'Antigua & Barbuda': 'Antigua and Barbuda',
    'BES': 'Bonaire',
    'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
    'Saint Kitts & Nevis': 'Saint Kitts and Nevis',
    'Saint Vincent & the Grenadines': 'Saint Vincent and the Grenadines',
    'Slovak Republic': 'Slovakia',
    'Trinidad & Tobago': 'Trinidad and Tobago',
    'Turks & Caicos': 'Turks and Caicos Islands',
    'United State of America': 'United States',
    Turkiye: 'Turkey',
    'European Union': 'European Union',
    'Yemen –': 'Yemen',
    'Iraq –': 'Iraq',
    'Tanzania-': 'Tanzania',
    'D.R. Congo': 'Democratic Republic of the Congo',
    Congo: 'Republic of the Congo',
    Pitcairn: 'Pitcairn Islands',
    'Russian Federation': 'Russia',
    Réunion: 'RÃ©union',
    'Saint Barthélemy': 'Saint BarthÃ©lemy',
    'Saint Helena, Ascension and Tristan da Cunha': 'Saint Helena',
    'Sao Tome and Principe': 'SÃ£o TomÃ© and PrÃncipe',
    'Syrian Arab Republic': 'Syria',
    'Tanzania, United Republic of': 'Tanzania',
    'Timor-Leste': 'East Timor',
    Türkiye: 'Turkey',
    'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
    'United States Minor Outlying Islands': 'U.S. Minor Outlying Islands',
    'United States of America': 'United States',
    'Viet Nam': 'Vietnam',
    'Virgin Islands': 'U.S. Virgin Islands',
    'Åland Islands': 'Ãland',
    Cameron: 'Cameroon',
    'Democratic Republic of Congo': 'Democratic Republic of the Congo',
    'Guinea (Conakry)': 'Guinea',
  };
  if (/^bostwana$/i.test(baseName)) return 'Botswana';
  if (/^sao tome.*prinsipe$/i.test(baseName)) return String.fromCodePoint(83, 195, 163, 111, 32, 84, 111, 109, 195, 169, 32, 97, 110, 100, 32, 80, 114, 195, 173, 110, 99, 105, 112, 101);
  if (/land$/i.test(baseName)) return String.fromCodePoint(195, 133, 108, 97, 110, 100);
  const normalizedAliases: Record<string, string> = Object.fromEntries(
    Object.entries(aliases).map(([key, name]) => [normalized(key), name])
  );
  return aliases[rawName] || aliases[baseName] || aliases[cleanedName] || normalizedAliases[normalized(cleanedName)] || cleanedName;
}

function headerScore(row: string[]): number {
  return row.reduce((score, value) => {
    const text = normalized(value);
    if (COUNTRY_HEADERS.some((header) => text === header || text.includes(header))) return score + 4;
    if (FEE_HEADERS.some((header) => text.includes(header))) return score + 1;
    return score;
  }, 0);
}

function findHeaderRows(rows: string[][]): number[] {
  const candidates = rows
    .map((row, index) => ({ index, score: headerScore(row) }))
    .filter((candidate) => candidate.score >= 4)
    .sort((left, right) => left.index - right.index);

  if (candidates.length === 0) return [];
  const first = candidates[0].index;
  const parentHeader = rows[first - 1] || [];
  const feeHeader = rows[first] || [];
  const hasProcedureGroupHeaders = parentHeader.some((value, column) => {
    const label = normalized(value);
    if (!label || /^(group|code|class|classes|currency)$/.test(label) ||
      COUNTRY_HEADERS.some((header) => label === header || label.includes(header)) ||
      REGION_HEADERS.some((header) => label === header || label.includes(header)) ||
      FEE_HEADERS.some((header) => label.includes(header))) return false;
    return feeHeader.slice(column, column + 3).some((subheader) =>
      FEE_HEADERS.some((header) => normalized(subheader).includes(header)),
    );
  });
  const rowsFound = hasProcedureGroupHeaders ? [first - 1, first] : [first];
  for (let index = first + 1; index < Math.min(rows.length, first + 3); index += 1) {
    if (rows[index].some((value) => FEE_HEADERS.some((header) => normalized(value).includes(header)))) {
      rowsFound.push(index);
    }
  }
  return rowsFound;
}

function parseAmount(value: string): number | undefined {
  const text = cell(value);
  if (!text || /^[-–—n\/a]+$/i.test(text)) return undefined;
  const negative = /^\(.*\)$/.test(text);
  const numeric = text.replace(/[(),]/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!numeric) return undefined;
  const amount = Number(numeric[0]);
  if (!Number.isFinite(amount)) return undefined;
  return negative ? -Math.abs(amount) : amount;
}

function detectCurrency(value: string): string | undefined {
  const upper = cell(value).toUpperCase();
  const code = CURRENCY_CODES.find((item) => new RegExp(`\\b${item}\\b`).test(upper));
  if (code) return code;
  if (upper.includes('$')) return 'USD';
  if (upper.includes('€')) return 'EUR';
  if (upper.includes('£')) return 'GBP';
  return undefined;
}

export function importClassesSheet(rows: string[][]): { records: ParsedClassRecord[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const hasClassMatrixHeaders = (row: string[]) => row.some((value) => /^class\s*\d{1,2}$/.test(normalized(value)));
  const headerIndex = rows.findIndex((row, index) => {
    const headers = row.map(normalized);
    return headers.some((value) => /^(class|class number|number)$/.test(value))
      || headers.some((value) => COUNTRY_HEADERS.some((header) => value === header || value.includes(header)))
        && (hasClassMatrixHeaders(row) || hasClassMatrixHeaders(rows[index - 1] || []));
  });
  if (headerIndex < 0) {
    return { records: [], issues: [{ sheet: 'Classes', row: 0, type: 'unrecognized_structure', message: 'The Classes sheet must contain a Class or Class Number column.' }] };
  }
  const headers = rows[headerIndex].map(normalized);
  const classIndex = headers.findIndex((value) => /^(class|class number|number)$/.test(value));
  const countryIndex = headers.findIndex((value) => COUNTRY_HEADERS.some((header) => (value || '') === header || (value || '').includes(header)));
  const usesGroupedHeaders = !hasClassMatrixHeaders(rows[headerIndex]) && hasClassMatrixHeaders(rows[headerIndex - 1] || []);
  const classHeaders = usesGroupedHeaders ? (rows[headerIndex - 1] || []).map(normalized) : headers;
  const matrixClassColumns = classHeaders
    .map((value, index) => ({ index, match: value.match(/^class\s*(\d{1,2})$/) }))
    .filter((item): item is { index: number; match: RegExpMatchArray } => Boolean(item.match))
    .map((item) => ({ index: item.index, classNumber: Number(item.match[1]) }))
    .filter((item) => item.classNumber >= 1 && item.classNumber <= 45);
  const subheaders = (usesGroupedHeaders ? rows[headerIndex] : rows[headerIndex + 1])?.map(normalized) || [];
  const hasFeeSubheaders = subheaders.some((value) => /official|government|attorney|atty|total/.test(value));
  const matrixFeeColumns = hasFeeSubheaders
    ? matrixClassColumns.map((column) => ({
      ...column,
      kind: (subheaders[column.index] || '').includes('official') || (subheaders[column.index] || '').includes('government')
        ? 'official' as const
        : (subheaders[column.index] || '').includes('attorney') || (subheaders[column.index] || '').includes('atty')
          ? 'attorney' as const
          : 'total' as const,
    }))
    : matrixClassColumns.map((column) => ({ ...column, kind: 'total' as const }));
  const claimingPriorityColumns = hasFeeSubheaders
    ? classHeaders.map((value, index) => ({ value, index, subheader: subheaders[index] || '' }))
      .filter((item) => /claiming priority|priority claim/.test(item.value))
      .map((item) => ({
        ...item,
        kind: item.subheader.includes('official') || item.subheader.includes('government')
          ? 'official' as const
          : item.subheader.includes('attorney') || item.subheader.includes('atty')
            ? 'attorney' as const
            : 'total' as const,
      }))
    : [];
  const nameIndex = headers.findIndex((value) => /^(name|description|class description|goods and services)$/.test(value));
  const officialIndex = headers.findIndex((value) => (value || '').includes('official') || (value || '').includes('government'));
  const attorneyIndex = headers.findIndex((value) => (value || '').includes('attorney') || (value || '').includes('atty'));
  const totalIndex = headers.findIndex((value) => (value || '').includes('total') || value === 'fee' || value === 'price' || value === 'cost');
  const currencyIndex = headers.findIndex((value) => (value || '').includes('currency'));
  const records: ParsedClassRecord[] = [];
  if (countryIndex >= 0 && matrixClassColumns.length > 0) {
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const country = cell(row[countryIndex]);
      if (!country) continue;
      const claimingPriority = claimingPriorityColumns.reduce<{ official?: number; attorney?: number; total?: number }>((result, column) => {
        const value = parseAmount(cell(row[column.index]));
        if (column.kind === 'official') result.official = value;
        if (column.kind === 'attorney') result.attorney = value;
        if (column.kind === 'total') result.total = value;
        return result;
      }, {});
      for (const classNumber of Array.from(new Set(matrixClassColumns.map((column) => column.classNumber)))) {
        const columns = matrixFeeColumns.filter((column) => column.classNumber === classNumber);
        const fees = columns.reduce<{ official?: number; attorney?: number; total?: number }>((result, column) => {
          const value = parseAmount(cell(row[column.index]));
          if (column.kind === 'official') result.official = value;
          if (column.kind === 'attorney') result.attorney = value;
          if (column.kind === 'total') result.total = value;
          return result;
        }, {});
        const total = fees.total ?? (fees.official !== undefined && fees.attorney !== undefined ? fees.official + fees.attorney : fees.official ?? fees.attorney);
        if (total === undefined && fees.official === undefined && fees.attorney === undefined) continue;
        records.push({
          class_number: classNumber,
          name: `Class ${classNumber}`,
          country,
          official_fee: fees.official,
          attorney_fee: fees.attorney,
          total_fee: total,
          claiming_priority_official_fee: claimingPriority.official,
          claiming_priority_attorney_fee: claimingPriority.attorney,
          claiming_priority_total_fee: claimingPriority.total ?? (claimingPriority.official !== undefined && claimingPriority.attorney !== undefined ? claimingPriority.official + claimingPriority.attorney : claimingPriority.official ?? claimingPriority.attorney),
          currency: 'USD',
          source_row: rowIndex + 1,
          source_values: row.map((value) => cell(value)),
        });
      }
    }
    if (!records.length) issues.push({ sheet: 'Classes', row: headerIndex + 1, type: 'unrecognized_structure', message: 'The Classes sheet contains no numeric country/class values.' });
    return { records, issues };
  }

  const seen = new Set<number>();
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const classNumber = Number.parseInt(cell(row[classIndex]), 10);
    if (!Number.isInteger(classNumber)) continue;
    if (classNumber < 1 || classNumber > 45) {
      issues.push({ sheet: 'Classes', row: rowIndex + 1, type: 'invalid_fee', message: `Class number must be between 1 and 45.` });
      continue;
    }
    if (seen.has(classNumber)) {
      issues.push({ sheet: 'Classes', row: rowIndex + 1, type: 'duplicate', message: `Duplicate class number: ${classNumber}.` });
      continue;
    }
    seen.add(classNumber);
    const officialText = officialIndex >= 0 ? cell(row[officialIndex]) : '';
    const attorneyText = attorneyIndex >= 0 ? cell(row[attorneyIndex]) : '';
    const totalText = totalIndex >= 0 ? cell(row[totalIndex]) : '';
    const name = nameIndex >= 0 ? cell(row[nameIndex]) : `Class ${classNumber}`;
    const official = parseAmount(officialText);
    const attorney = parseAmount(attorneyText);
    const total = parseAmount(totalText);
    records.push({
      class_number: classNumber,
      name: name || `Class ${classNumber}`,
      official_fee: official,
      attorney_fee: attorney,
      total_fee: total ?? (official !== undefined && attorney !== undefined ? official + attorney : undefined),
      currency: detectCurrency(`${officialText} ${attorneyText} ${totalText} ${currencyIndex >= 0 ? cell(row[currencyIndex]) : ''}`) || 'USD',
      source_row: rowIndex + 1,
      source_values: row.map((value) => cell(value)),
    });
  }
  if (!records.length) issues.push({ sheet: 'Classes', row: headerIndex + 1, type: 'unrecognized_structure', message: 'The Classes sheet contains no class records.' });
  return { records, issues };
}

function isRegionLabel(value: string): boolean {
  const text = normalized(value);
  return /^(africa|americas|asia|europe|middle east|oceania|international|regional|eu|aripo|oapi)$/.test(text);
}

function buildColumnGroups(rows: string[][], headerRows: number[]): { groups: ColumnGroup[]; countryIndex: number; regionIndex: number } {
  const width = Math.max(...rows.slice(0, Math.max(...headerRows) + 1).map((row) => row.length), 0);
  const labels = Array.from({ length: width }, (_, column) =>
    headerRows.map((rowIndex) => cell(rows[rowIndex]?.[column])).filter(Boolean)
  );
  let currentService = '';
  let countryIndex = 0;
  let regionIndex = -1;
  const groups: ColumnGroup[] = [];

  labels.forEach((parts, column) => {
    const joined = normalized(parts.join(' '));
    if (COUNTRY_HEADERS.some((header) => joined.includes(header))) countryIndex = column;
    if (REGION_HEADERS.some((header) => joined.includes(header))) regionIndex = column;

    const servicePart = parts.find((part) => {
      const text = normalized(part);
      return text && !COUNTRY_HEADERS.some((header) => text.includes(header)) && !FEE_HEADERS.some((header) => text.includes(header)) && !REGION_HEADERS.some((header) => text.includes(header));
    });
    if (servicePart) currentService = servicePart;
    const subheader = normalized(parts[parts.length - 1] || '');
    if (!currentService || (!subheader && parts.length < 2)) return;

    let group = groups.find((item) => normalized(item.service) === normalized(currentService));
    if (!group) {
      group = { service: currentService, officialIndex: -1, attorneyIndex: -1, totalIndex: -1, currencyIndex: -1 };
      groups.push(group);
    }
    if (subheader.includes('official') || subheader.includes('government')) group.officialIndex = column;
    else if (subheader.includes('attorney') || subheader.includes('atty')) group.attorneyIndex = column;
    else if (subheader.includes('total')) group.totalIndex = column;
    else if (subheader.includes('currency')) group.currencyIndex = column;
    else if (subheader.includes('fee') || subheader.includes('cost') || subheader.includes('price')) {
      if (group.officialIndex < 0) group.officialIndex = column;
      else if (group.totalIndex < 0) group.totalIndex = column;
    }
  });

  return { groups: groups.filter((group) => group.officialIndex >= 0 || group.attorneyIndex >= 0 || group.totalIndex >= 0), countryIndex, regionIndex };
}

export function importSheet(sheetName: string, rows: string[][]): SheetImportResult {
  const issues: ImportIssue[] = [];
  const headerRows = findHeaderRows(rows);
  if (headerRows.length === 0) {
    return {
      records: [],
      issues: [{ sheet: sheetName, row: 0, type: 'unrecognized_structure', message: 'No country or fee header row was detected.' }],
      header_rows: [],
    };
  }

  const { groups, countryIndex, regionIndex } = buildColumnGroups(rows, headerRows);
  if (groups.length === 0) {
    issues.push({ sheet: sheetName, row: headerRows[0] + 1, type: 'unrecognized_structure', message: 'No service fee columns were detected.' });
  }

  const records: ParsedFeeRecord[] = [];
  const identities = new Set<string>();
  let currentRegion = '';
  const firstDataRow = Math.max(...headerRows) + 1;

  for (let rowIndex = firstDataRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (!row.some((value) => cell(value))) continue;
    const country = canonicalCountry(row[countryIndex] || '');
    const rowHasAmount = groups.some((group) => [group.officialIndex, group.attorneyIndex, group.totalIndex].some((index) => index >= 0 && parseAmount(row[index] || '') !== undefined));

    if (!country && !rowHasAmount) continue;
    if (country && isRegionLabel(country) && !rowHasAmount) {
      currentRegion = country;
      continue;
    }
    if (!country) {
      issues.push({ sheet: sheetName, row: rowIndex + 1, type: 'missing_country', message: 'Fee row has values but no country.' });
      continue;
    }

    const rowRegion = regionIndex >= 0 ? cell(row[regionIndex]) : currentRegion;
    for (const group of groups) {
      const officialText = group.officialIndex >= 0 ? cell(row[group.officialIndex]) : '';
      const attorneyText = group.attorneyIndex >= 0 ? cell(row[group.attorneyIndex]) : '';
      const totalText = group.totalIndex >= 0 ? cell(row[group.totalIndex]) : '';
      const official = parseAmount(officialText);
      const attorney = parseAmount(attorneyText);
      const explicitTotal = parseAmount(totalText);
      const hasValue = official !== undefined || attorney !== undefined || explicitTotal !== undefined;
      if (!hasValue) continue;

      if ([officialText, attorneyText, totalText].some((value) => {
        const text = cell(value);
        return text && !/^(?:[-–—]+|n\/?a|na|not applicable)$/i.test(text) && parseAmount(text) === undefined && !detectCurrency(text);
      })) {
        issues.push({ sheet: sheetName, row: rowIndex + 1, type: 'invalid_fee', message: `Invalid fee value for service "${group.service}".` });
        continue;
      }

      const identity = `${sheetName}|${normalized(country)}|${normalized(group.service)}`;
      if (identities.has(identity)) {
        issues.push({ sheet: sheetName, row: rowIndex + 1, type: 'duplicate', message: `Duplicate country/service record: ${country} / ${group.service}.` });
        continue;
      }
      identities.add(identity);
      const currency = detectCurrency(`${officialText} ${attorneyText} ${totalText}`) || detectCurrency(group.service) || 'USD';
      records.push({
        category: sheetName,
        country,
        region: rowRegion || undefined,
        service: group.service,
        official_fee: official,
        attorney_fee: attorney,
        total_fee: explicitTotal ?? (official !== undefined && attorney !== undefined ? official + attorney : undefined),
        currency,
        source_sheet: sheetName,
        source_row: rowIndex + 1,
        source_identifier: `${sheetName}:${normalized(country)}:${normalized(group.service)}`,
        record_key: `${normalized(sheetName)}|${normalized(country)}|${normalized(group.service)}`,
        source_values: row.map((value) => cell(value)),
      });
    }
  }

  return { records, issues, header_rows: headerRows.map((row) => row + 1) };
}
