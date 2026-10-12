import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { importSheet } from './importer.ts';

Deno.test('importSheet parses country-by-country procedure fee matrices', () => {
  const rows: string[][] = [];
  rows[0] = ['PROCEDURE', 'UNITED STATES', 'UNITED STATES', 'UNITED STATES', 'CANADA', 'CANADA', 'CANADA'];
  rows[2] = ['', 'Official Fees (US$)', 'Attorney Fees (US$)', 'TOTAL (US$)', 'Official Fees (US$)', 'Attorney Fees (US$)', 'TOTAL (US$)'];
  rows[4] = ['Filing', '1200', '500', '1700', '900', '300', '1200'];

  const result = importSheet('Patent', rows);
  const usFiling = result.records.find((record) => record.country.toLowerCase() === 'united states' && record.service === 'Filing');
  const canadaFiling = result.records.find((record) => record.country.toLowerCase() === 'canada' && record.service === 'Filing');

  assertEquals(result.issues, []);
  assertEquals(usFiling?.official_fee, 1200);
  assertEquals(usFiling?.attorney_fee, 500);
  assertEquals(usFiling?.total_fee, 1700);
  assertEquals(canadaFiling?.official_fee, 900);
  assertEquals(canadaFiling?.total_fee, 1200);
});
