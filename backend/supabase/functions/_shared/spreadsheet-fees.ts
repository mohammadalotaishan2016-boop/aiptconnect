import { canonicalCountry, importClassesSheet, importSheet } from '../sync-fees/importer.ts';
import type { ClassRate } from './quotation-class-pricing.ts';

type Country = { id: string; name: string };
type Procedure = { name: string };
type WorkbookSheet = { name: string; cells: Record<string, unknown> };

export type SpreadsheetFee = {
  id: string;
  country_id: string;
  category: string;
  procedure_name: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency: string;
  available: boolean;
  issue: string | null;
};

type SpreadsheetAddonFee = {
  country_id: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency: string;
};

export type SpreadsheetPricing = {
  fees: SpreadsheetFee[];
  class_rates: ClassRate[];
  claiming_priority_fees: SpreadsheetAddonFee[];
  state_fees: SpreadsheetFee[];
};

function columnNumber(value: string) {
  return [...value.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function evaluateFormula(input: string, sheet: WorkbookSheet, resolving: Set<string>): number | string {
  const tokens = input.slice(1).toUpperCase().match(/[A-Z]+\d+|(?:\d+(?:\.\d*)?|\.\d+)|[A-Z]+|[()+\-*/,:]/g) ?? [];
  const stripped = input.slice(1).toUpperCase().replace(/\s/g, '');
  if (!tokens.length || tokens.join('') !== stripped) return '#ERROR!';
  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const cellValue = (address: string): number => {
    if (resolving.has(address)) throw new Error('Circular reference');
    const raw = String(sheet.cells[address] ?? '');
    if (!raw) return 0;
    if (!raw.startsWith('=')) {
      const number = Number(raw);
      return Number.isFinite(number) ? number : 0;
    }
    resolving.add(address);
    const value = evaluateFormula(raw, sheet, resolving);
    resolving.delete(address);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid cell reference');
    return value;
  };
  const parseAdditive: () => number = () => {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const parsePrimary = (): number => {
    const token = peek();
    if (token === '+' || token === '-') {
      consume();
      const value = parsePrimary();
      return token === '-' ? -value : value;
    }
    if (token === '(') {
      consume();
      const value = parseAdditive();
      if (consume() !== ')') throw new Error('Unexpected token');
      return value;
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token ?? '')) {
      consume();
      return Number(token);
    }
    if (/^[A-Z]+\d+$/.test(token ?? '')) {
      consume();
      return cellValue(token);
    }
    if (/^[A-Z]+$/.test(token ?? '')) {
      const functionName = consume();
      if (functionName !== 'SUM' && functionName !== 'AVERAGE') throw new Error('Unsupported function');
      if (consume() !== '(') throw new Error('Unexpected token');
      const values: number[] = [];
      while (peek() !== ')') {
        const start = consume();
        if (!/^[A-Z]+\d+$/.test(start ?? '')) throw new Error('Invalid range');
        if (peek() === ':') {
          consume();
          const end = consume();
          if (!/^[A-Z]+\d+$/.test(end ?? '')) throw new Error('Invalid range');
          const startMatch = /^([A-Z]+)(\d+)$/.exec(start);
          const endMatch = /^([A-Z]+)(\d+)$/.exec(end);
          if (!startMatch || !endMatch) throw new Error('Invalid range');
          for (let row = Math.min(Number(startMatch[2]), Number(endMatch[2])); row <= Math.max(Number(startMatch[2]), Number(endMatch[2])); row++) {
            for (let column = Math.min(columnNumber(startMatch[1]), columnNumber(endMatch[1])); column <= Math.max(columnNumber(startMatch[1]), columnNumber(endMatch[1])); column++) {
              let letters = '';
              for (let current = column; current > 0; current = Math.floor((current - 1) / 26)) letters = String.fromCharCode(65 + (current - 1) % 26) + letters;
              values.push(cellValue(`${letters}${row}`));
            }
          }
        } else values.push(cellValue(start));
        if (peek() !== ',') break;
        consume();
      }
      if (consume() !== ')' || (functionName === 'AVERAGE' && !values.length)) throw new Error('Invalid function arguments');
      return functionName === 'SUM' ? values.reduce((sum, value) => sum + value, 0) : values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    throw new Error('Invalid formula');
  };
  const parseMultiplicative = (): number => {
    let value = parsePrimary();
    while (peek() === '*' || peek() === '/') {
      const operator = consume();
      const right = parsePrimary();
      if (operator === '/' && right === 0) throw new Error('Division by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  try {
    const value = parseAdditive();
    return cursor === tokens.length && Number.isFinite(value) ? Number(value.toFixed(10)) : '#ERROR!';
  } catch {
    return '#ERROR!';
  }
}

function sheetRows(sheet: WorkbookSheet): string[][] {
  const values: string[][] = [];
  for (const [address, raw] of Object.entries(sheet.cells)) {
    const match = /^([A-Z]+)([1-9]\d*)$/i.exec(address);
    if (!match) continue;
    const row = Number(match[2]);
    const column = columnNumber(match[1]);
    if (row > 10000 || column > 256) throw new Error(`Worksheet "${sheet.name}" exceeds the supported quotation data range.`);
    const value = String(raw ?? '');
    const displayed = value.startsWith('=') ? evaluateFormula(value, sheet, new Set([address.toUpperCase()])) : value;
    while (values.length < row) values.push([]);
    values[row - 1][column - 1] = String(displayed);
  }
  return values;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function categoryForSheet(value: string): string | null {
  const name = normalized(value);
  if (name === 'trademark') return 'Trademark';
  if (name === 'patent') return 'Patent';
  if (name === 'design') return 'Design';
  if (name === 'copyright') return 'Copyright';
  if (name === 'others' || name === 'other') return 'Others';
  return null;
}

function classTypeForSheet(value: string) {
  const name = normalized(value);
  if (name === 'multiclass' || name === 'multiclasses') return 'Multi-class';
  if (name === 'upto3classes' || name === 'upto3class') return 'Up to 3 classes';
  if (name === 'upto5classes' || name === 'upto5class') return 'Up to 5 classes';
  return null;
}

function procedureNameForSheet(category: string, name: string, procedures: Map<string, string>): string | undefined {
  if (normalized(name) === 'filing') {
    const applicationName = category === 'Patent'
      ? 'new patent application'
      : category === 'Design'
        ? 'new design application'
        : '';
    const applicationProcedure = applicationName ? procedures.get(normalized(applicationName)) : undefined;
    if (applicationProcedure) return applicationProcedure;
  }
  return procedures.get(normalized(name));
}

function validPrice(official: number | undefined, attorney: number | undefined, total: number | undefined, currency: string | undefined) {
  const complete = official !== undefined && attorney !== undefined && total !== undefined &&
    [official, attorney, total].every(value => Number.isFinite(value) && value >= 0) &&
    total >= official + attorney && currency === 'USD';
  return {
    official_fee: official ?? 0,
    attorney_fee: attorney ?? 0,
    total_fee: total ?? 0,
    currency: currency ?? '',
    available: complete,
    issue: complete ? null : 'The workbook rate must contain valid official, attorney, and total fees in USD.',
  };
}

export function parseSpreadsheetPricing(workbook: unknown, countries: Country[], procedures: Procedure[]): SpreadsheetPricing {
  if (!workbook || typeof workbook !== 'object' || !('sheets' in workbook) || !Array.isArray(workbook.sheets)) {
    throw new Error('The saved fee workbook is invalid.');
  }
  const countryByName = new Map(countries.map(country => [normalized(canonicalCountry(country.name)), country.id]));
  const procedureByName = new Map(procedures.map(procedure => [normalized(procedure.name), procedure.name]));
  const sheets = workbook.sheets as WorkbookSheet[];
  const fees: SpreadsheetFee[] = [];
  const class_rates: ClassRate[] = [];
  const priorityByCountry = new Map<string, SpreadsheetAddonFee>();
  const feeSignatures = new Map<string, Set<string>>();

  for (const sheet of sheets) {
    if (!sheet || typeof sheet.name !== 'string' || !sheet.cells || typeof sheet.cells !== 'object') continue;
    const rows = sheetRows(sheet);
    const category = categoryForSheet(sheet.name);
    const classType = classTypeForSheet(sheet.name);
    if (category) {
      const imported = importSheet(category, rows);
      for (const record of imported.records) {
        const countryId = countryByName.get(normalized(canonicalCountry(record.country)));
        const procedureName = procedureNameForSheet(category, record.service, procedureByName);
        if (!countryId || !procedureName) continue;
        const key = `${countryId}|${category}|${normalized(procedureName)}`;
        const price = validPrice(record.official_fee, record.attorney_fee, record.total_fee, record.currency);
        const signature = JSON.stringify(price);
        const signatures = feeSignatures.get(key) ?? new Set<string>();
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        feeSignatures.set(key, signatures);
        fees.push({ id: key, country_id: countryId, category, procedure_name: procedureName, ...price });
      }
    }
    if (classType) {
      const imported = importClassesSheet(rows);
      for (const record of imported.records) {
        if (!record.country) continue;
        const countryId = countryByName.get(normalized(canonicalCountry(record.country)));
        if (!countryId) continue;
        const price = validPrice(record.official_fee, record.attorney_fee, record.total_fee, record.currency);
        class_rates.push({ country_id: countryId, class_type: classType, class_number: record.class_number, ...price });
        if (record.claiming_priority_total_fee !== undefined || record.claiming_priority_official_fee !== undefined || record.claiming_priority_attorney_fee !== undefined) {
          const priority = validPrice(record.claiming_priority_official_fee, record.claiming_priority_attorney_fee, record.claiming_priority_total_fee, 'USD');
          const previous = priorityByCountry.get(countryId);
          if (previous && (previous.official_fee !== priority.official_fee || previous.attorney_fee !== priority.attorney_fee || previous.total_fee !== priority.total_fee)) {
            throw new Error(`The workbook has inconsistent claiming-priority fees for ${record.country}.`);
          }
          priorityByCountry.set(countryId, {
            country_id: countryId,
            official_fee: priority.official_fee,
            attorney_fee: priority.attorney_fee,
            total_fee: priority.total_fee,
            currency: priority.currency,
          });
        }
      }
    }
  }

  return {
    fees,
    class_rates,
    claiming_priority_fees: [...priorityByCountry.values()],
    state_fees: fees.filter(fee => fee.category === 'Trademark' && /state/i.test(fee.procedure_name)),
  };
}
