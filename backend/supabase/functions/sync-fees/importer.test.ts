import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildClassValueRows, importClassesSheet, importSheet } from './importer.ts';

Deno.test('importClassesSheet parses the matrix-style Classes sheet', () => {
  const rows = [
    ['Country', 'Class 1', 'Class 2'],
    ['Afghanistan', '120', '200'],
    ['Albania', '300', '400'],
  ];

  const result = importClassesSheet(rows);

  assertEquals(result.records.length, 4);
  assertEquals(result.records[0].class_number, 1);
  assertEquals(result.records[0].country, 'Afghanistan');
  assertEquals(result.records[0].total_fee, 120);
  assertEquals(result.records[1].class_number, 2);
  assertEquals(result.records[1].total_fee, 200);
});

Deno.test('importClassesSheet parses grouped class headers used by the shared Multi-classes workbook', () => {
  const classHeaders: string[] = [];
  classHeaders[4] = 'Class2';
  classHeaders[5] = 'Class2';
  classHeaders[6] = 'Class2';
  classHeaders[7] = 'Class3';
  classHeaders[8] = 'Class3';
  classHeaders[9] = 'Class3';
  const feeHeaders: string[] = [];
  feeHeaders[1] = 'Country';
  feeHeaders[4] = 'Official Fees (US$)';
  feeHeaders[5] = 'Attorney Fees (US$)';
  feeHeaders[6] = 'TOTAL (US$)';
  feeHeaders[7] = 'Official Fees (US$)';
  feeHeaders[8] = 'Attorney Fees (US$)';
  feeHeaders[9] = 'TOTAL (US$)';
  const afghanistan: string[] = [];
  afghanistan[1] = 'Afghanistan';
  afghanistan[4] = '80';
  afghanistan[5] = '500';
  afghanistan[6] = '580';
  afghanistan[7] = '10';
  afghanistan[8] = '200';
  afghanistan[9] = '210';
  const rows = [classHeaders, feeHeaders, afghanistan];

  const result = importClassesSheet(rows);

  assertEquals(result.issues, []);
  assertEquals(result.records.length, 2);
  assertEquals(result.records[0].class_number, 2);
  assertEquals(result.records[0].country, 'Afghanistan');
  assertEquals(result.records[0].official_fee, 80);
  assertEquals(result.records[0].attorney_fee, 500);
  assertEquals(result.records[0].total_fee, 580);
  assertEquals(result.records[1].class_number, 3);
  assertEquals(result.records[1].total_fee, 210);
});

Deno.test('importSheet keeps procedure group headers above country and fee subheaders', () => {
  const serviceHeaders: string[] = [];
  serviceHeaders[6] = 'Registration';
  serviceHeaders[7] = 'Registration';
  serviceHeaders[8] = 'Registration';
  serviceHeaders[9] = 'Search';
  serviceHeaders[10] = 'Search';
  serviceHeaders[11] = 'Search';
  const feeHeaders: string[] = [];
  feeHeaders[2] = 'Group';
  feeHeaders[3] = 'Country';
  feeHeaders[4] = 'Code';
  feeHeaders[5] = 'Classes';
  feeHeaders[6] = 'Official Fees (US$)';
  feeHeaders[7] = 'Attorney Fees (US$)';
  feeHeaders[8] = 'TOTAL (US$)';
  feeHeaders[9] = 'Official Fees (US$)';
  feeHeaders[10] = 'Attorney Fees (US$)';
  feeHeaders[11] = 'TOTAL (US$)';
  const afghanistan: string[] = [];
  afghanistan[3] = 'Afghanistan';
  afghanistan[4] = 'AF';
  afghanistan[5] = 'Per Mark Per Class';
  afghanistan[6] = '185';
  afghanistan[7] = '500';
  afghanistan[8] = '685';
  afghanistan[9] = '10';
  afghanistan[10] = '200';
  afghanistan[11] = '210';

  const result = importSheet('Trademark', [[], [], serviceHeaders, feeHeaders, afghanistan]);
  const registration = result.records.find((record) => record.service === 'Registration');

  assertEquals(registration?.country, 'Afghanistan');
  assertEquals(registration?.official_fee, 185);
  assertEquals(registration?.attorney_fee, 500);
  assertEquals(registration?.total_fee, 685);
});

Deno.test('buildClassValueRows creates one row per country and class', () => {
  const countryMap = new Map([['afghanistan', 'country-1'], ['albania', 'country-2']]);
  const rows = [
    {
      class_number: 1,
      country: 'Afghanistan',
      total_fee: 120,
      currency: 'USD',
      source_row: 2,
      source_values: ['Afghanistan', '120'],
      name: 'Class 1',
    },
    {
      class_number: 2,
      country: 'Albania',
      total_fee: 400,
      currency: 'USD',
      source_row: 3,
      source_values: ['Albania', '400'],
      name: 'Class 2',
    },
  ] as any;

  const valueRows = buildClassValueRows(rows, countryMap, 'dataset-1');

  assertEquals(valueRows.length, 2);
  assertEquals(valueRows[0].country_id, 'country-1');
  assertEquals(valueRows[0].class_number, 1);
  assertEquals(valueRows[0].total_fee, 120);
  assertEquals(valueRows[1].country_id, 'country-2');
  assertEquals(valueRows[1].class_number, 2);
  assertEquals(valueRows[1].total_fee, 400);
});
