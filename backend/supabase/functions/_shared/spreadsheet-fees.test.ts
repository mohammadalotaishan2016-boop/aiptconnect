import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseSpreadsheetPricing } from './spreadsheet-fees.ts';

Deno.test('parseSpreadsheetPricing maps Patent Filing rates to the application procedure', () => {
  const pricing = parseSpreadsheetPricing({
    sheets: [{
      name: 'Patent',
      cells: {
        A1: 'PROCEDURE',
        B1: 'UNITED STATES',
        C1: 'UNITED STATES',
        D1: 'UNITED STATES',
        B3: 'Official Fees (US$)',
        C3: 'Attorney Fees (US$)',
        D3: 'TOTAL (US$)',
        A5: 'Filing',
        B5: '1200',
        C5: '500',
        D5: '1700',
      },
    }],
  }, [{ id: 'us', name: 'United States' }], [{ name: 'Filing' }, { name: 'New Patent Application' }]);

  assertEquals(pricing.fees, [{
    id: 'us|Patent|newpatentapplication',
    country_id: 'us',
    category: 'Patent',
    procedure_name: 'New Patent Application',
    official_fee: 1200,
    attorney_fee: 500,
    total_fee: 1700,
    currency: 'USD',
    available: true,
    issue: null,
  }]);
});

Deno.test('parseSpreadsheetPricing maps Design Filing rates to the application procedure', () => {
  const pricing = parseSpreadsheetPricing({
    sheets: [{
      name: 'Design',
      cells: {
        A1: 'PROCEDURE',
        B1: 'UNITED STATES',
        C1: 'UNITED STATES',
        D1: 'UNITED STATES',
        B3: 'Official Fees (US$)',
        C3: 'Attorney Fees (US$)',
        D3: 'TOTAL (US$)',
        A5: 'Filing',
        B5: '250',
        C5: '150',
        D5: '400',
      },
    }],
  }, [{ id: 'us', name: 'United States' }], [{ name: 'Filing' }, { name: 'New Design Application' }]);

  assertEquals(pricing.fees.map((fee) => [fee.category, fee.procedure_name, fee.total_fee, fee.available]), [
    ['Design', 'New Design Application', 400, true],
  ]);
});
