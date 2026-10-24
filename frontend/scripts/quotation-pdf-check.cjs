/* Render the production component with explicit test fixtures; no account data is used. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
for (const extension of ['.tsx', '.ts']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText.replace('"use strict";', extension === '.tsx' ? '"use strict"; const React = require("react");' : '"use strict";'), filename);
};
const { createQuotationQr, quotationVerificationUrl } = require('../src/lib/quotation-qr.ts');
const { default: Document, quotationRow, quotationRequirementRows } = require('../src/components/QuotationDocument.tsx');
const output = path.resolve(root, '../output/pdf');
const tmp = path.resolve(root, '../tmp/pdfs');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });
for (const category of ['Patent', 'Design']) {
  const markup = renderToStaticMarkup(React.createElement(Document, {
    invoice: {
      reference_no: 'TEST',
      invoice_date: '2026-10-12',
      grand_total: 300,
      total_vat: 0,
      discount: 0,
      currency: 'USD',
      vatable: false,
      vat_rate: 0,
      quotation_items: [{
        category,
        country_id: 'country',
        procedure_name: 'New ' + category + ' Application',
        quantity: 1,
        class_numbers: [],
        class_count: 0,
        official_fee: 100,
        attorney_fee: 200,
        other_fee: 0,
        country: { name: 'United States' },
      }],
    },
    requirements: [],
    qrDataUrl: '',
  }));
  assert.doesNotMatch(markup, /Class<br\/>numbers/);
}
const trademarkMarkup = renderToStaticMarkup(React.createElement(Document, {
  invoice: {
    reference_no: 'TEST',
    invoice_date: '2026-10-12',
    grand_total: 300,
    total_vat: 0,
    discount: 0,
    currency: 'USD',
    vatable: false,
    vat_rate: 0,
    quotation_items: [{
      category: 'Trademark',
      country_id: 'country',
      procedure_name: 'Registration',
      quantity: 1,
      class_numbers: [1],
      class_count: 1,
      official_fee: 100,
      attorney_fee: 200,
      other_fee: 0,
      country: { name: 'United States' },
    }],
  },
  requirements: [],
  qrDataUrl: '',
}));
assert.match(trademarkMarkup, /Class<br\/>numbers/);
assert.match(trademarkMarkup, />1<\/td>/);
assert.match(trademarkMarkup, /FEE BREAKDOWN \(USD\)/);
assert.match(trademarkMarkup, />100<\/td>/, 'Whole-dollar fees omit trailing .00');
assert.doesNotMatch(trademarkMarkup, /100\.00/);
const approvedMarkup = renderToStaticMarkup(React.createElement(Document, {
  invoice: { reference_no: 'APPROVED', invoice_date: '2026-10-12', status: 'Approved', valid_until: '2027-01-10T00:00:00.000Z', grand_total: 300, total_vat: 0, discount: 0, currency: 'USD', vatable: false, vat_rate: 0, quotation_items: [] },
  requirements: [], qrDataUrl: '',
}));
assert.match(approvedMarkup, /quotation-sheet[^>]*is-approved/);
const pendingMarkup = renderToStaticMarkup(React.createElement(Document, {
  invoice: { reference_no: 'PENDING', invoice_date: '2026-10-12', status: 'Pending Approval', grand_total: 300, total_vat: 0, discount: 0, currency: 'USD', vatable: false, vat_rate: 0, quotation_items: [] },
  requirements: [], qrDataUrl: '',
}));
assert.doesNotMatch(pendingMarkup, /quotation-sheet[^>]*is-approved/);
const sixLineMarkup = renderToStaticMarkup(React.createElement(Document, {
  invoice: { reference_no: 'PAGES', invoice_date: '2026-10-12', grand_total: 600, total_vat: 0, discount: 0, currency: 'USD', vatable: false, vat_rate: 0, quotation_items: Array.from({ length: 6 }, (_, index) => ({ category: 'Patent', country_id: 'country', procedure_name: `Procedure ${index + 1}`, quantity: 1, official_fee: 100, attorney_fee: 0, other_fee: 0, country: { name: 'United States' } })) },
  requirements: [], qrDataUrl: '',
}));
assert.equal((sixLineMarkup.match(/quotation-fee-page-break/g) || []).length, 1, 'Fee rows start a new printed page every five rows');
const trademarkCountOnlyMarkup = renderToStaticMarkup(React.createElement(Document, {
  invoice: {
    reference_no: 'TEST',
    invoice_date: '2026-10-12',
    grand_total: 300,
    total_vat: 0,
    discount: 0,
    currency: 'USD',
    vatable: false,
    vat_rate: 0,
    quotation_items: [{
      category: 'Trademark',
      country_id: 'country',
      procedure_name: 'Registration',
      quantity: 1,
      class_numbers: [],
      class_count: 3,
      official_fee: 100,
      attorney_fee: 200,
      other_fee: 0,
      country: { name: 'United States' },
    }],
  },
  requirements: [],
  qrDataUrl: '',
}));
assert.doesNotMatch(trademarkCountOnlyMarkup, /Class<br\/>numbers/);
const invoice = { reference_no: 'T-2026-6020-AF', invoice_date: '2026-09-12', valid_until: '2026-10-16T09:00:00.000Z', client_matter_ref: '1212', currency: 'USD', grand_total: 2842, total_vat: 72, discount: 50, vatable: true, vat_rate: 10, client: { company_name: 'PDF Layout Test Client', address: 'Example address - layout validation only' }, quotation_items: [{ country_id: 'af', procedure_name: 'Renewal', quantity: 2, class_numbers: [1, 2, 3], official_fee: 2100, attorney_fee: 720, other_fee: 0, vat_rate: 10, requirement_ids: ['r1'], country: { name: 'Afghanistan' } }] };
const row = quotationRow(invoice.quotation_items[0], invoice, 0);
assert.equal(row.total, 2770);
assert.equal(row.vat, 72);
assert.equal(invoice.quotation_items[0].official_fee / row.multiplier, 350);
assert.equal(invoice.quotation_items[0].attorney_fee / row.multiplier, 120);
assert.equal(quotationRow({ ...invoice.quotation_items[0], other_fee: 20, claiming_priority_fee: 30, state_fee_total: 40 }, invoice, 0).total, 2860);
assert.equal(quotationRow(invoice.quotation_items[0], { ...invoice, vatable: false }, 1).vat, 0);
const requirementFixtures = [
  { id: 'selected', country_id: 'af', procedure: 'Renewal', category: 'Trademark', description: 'Selected requirement' },
  { id: 'applicable', country_id: 'af', procedure: 'Renewal', category: 'Trademark', description: 'Applicable requirement' },
  { id: 'other-country', country_id: 'other', procedure: 'Renewal', category: 'Trademark', description: 'Wrong country' },
  { id: 'other-procedure', country_id: 'af', procedure: 'Filing', category: 'Trademark', description: 'Wrong procedure' },
  { id: 'other-service', country_id: 'af', procedure: 'Renewal', category: 'Patent', description: 'Wrong service' },
];
const itemFixture = { ...invoice.quotation_items[0], category: 'Trademark', requirement_ids: [] };
assert.deepEqual(quotationRequirementRows({ ...invoice, quotation_items: [itemFixture] }, requirementFixtures).map(row => row.description), ['Selected requirement', 'Applicable requirement']);
assert.equal(quotationRequirementRows({ ...invoice, quotation_items: [itemFixture, itemFixture] }, requirementFixtures).length, 2);
assert.deepEqual(quotationRequirementRows({ ...invoice, quotation_items: [{ ...itemFixture, requirement_ids: ['selected'] }] }, requirementFixtures).map(row => row.description), ['Selected requirement']);
assert.match(quotationRequirementRows({ ...invoice, quotation_items: [{ ...itemFixture, requirement_ids: ['other-country'] }] }, requirementFixtures)[0].description, /no longer available/);
assert.equal(quotationRequirementRows({ ...invoice, quotation_items: [itemFixture] }, []).length, 0);
const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
const styles = [...layout.matchAll(/import '\.\/(.+\.css)'/g)].map(match => fs.readFileSync(path.join(root, 'app', match[1]), 'utf8')).join('\n') + fs.readFileSync(path.join(root, 'app/invoice/invoice.css'), 'utf8') + fs.readFileSync(path.join(root, 'app/invoice/quotation-document.css'), 'utf8');
async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1170, height: 1500 }, deviceScaleFactor: 1 });
    const qrDataUrl = await createQuotationQr('https://aiptconnect.aiptlaw.com/invoice/verify/0123456789abcdef0123456789abcdef0123456789abcdef');
    assert.match(qrDataUrl, /^data:image\/svg\+xml/);
    assert.throws(() => quotationVerificationUrl(''));
    assert.equal(quotationVerificationUrl('0'.repeat(48)), 'https://aiptconnect.aiptlaw.com/invoice/verify/' + '0'.repeat(48));
    for (const variant of ['reference', 'compact', 'long', 'design', 'discount-only', 'vat-only', 'neither']) {
      let data = variant === 'reference' ? invoice : variant === 'compact' ? { ...invoice, quotation_items: Array.from({ length: 4 }, () => ({ ...invoice.quotation_items[0] })), grand_total: 11518, total_vat: 288 } : { ...invoice, quotation_items: Array.from({ length: 12 }, (_, i) => ({ ...invoice.quotation_items[0], requirement_ids: ['r' + i], procedure_name: 'Renewal and registration of international trademarks' })), grand_total: 34654, total_vat: 864 };
      if (['discount-only', 'vat-only', 'neither'].includes(variant)) {
        const discount = variant === 'discount-only' ? 50 : 0;
        const total_vat = variant === 'vat-only' ? 72 : 0;
        data = { ...invoice, discount, total_vat, vatable: total_vat > 0, grand_total: 2820 - discount + total_vat };
      }
      if (variant === 'design') data = {
        ...invoice, reference_no: 'T-2026-SAMPLE-CY', invoice_date: '2026-09-23', client_matter_ref: '79',
        valid_until: '2026-10-23T09:00:00.000Z', client: { company_name: 'Sample quotation client', address: 'Office 10, Bldg. 03, South of Manarat\nAl Riyadh School, Exit 8' },
        discount: 0, total_vat: 0, vatable: false, grand_total: 2415,
        quotation_items: [{ country_id: 'cy', category: 'Trademark', procedure_name: 'Registration', quantity: 1,
          class_numbers: [1, 8, 14, 22, 26, 31, 33], official_fee: 1225, attorney_fee: 1190, other_fee: 0, country: { name: 'Cyprus' },
          class_pricing_rows: Array.from({length: 7}, (_, i) => ({label: i === 0 ? '1st class' : (i === 1 ? '2nd class' : i === 2 ? '3rd class' : (i + 1) + 'th class'), class_from: i + 1, class_to: i + 1, official_fee: 175, attorney_fee: 170, total_fee: 345, currency: 'USD', source: 'Trademark'})) }]
      };
      let requirements = variant !== 'long' ? [{ id: 'r1', country_id: 'af', procedure: 'Renewal', description: 'Signed power of attorney.\nCopy of the trademark registration certificate.' }] : data.quotation_items.map((item, i) => ({ id: 'r' + i, country_id: 'af', procedure: item.procedure_name, description: 'Provide a signed power of attorney and the registration certificate.\n' + 'Long requirement text to verify wrapping and printed pagination. '.repeat(5) }));
      if (variant === 'design') requirements = [{ id: 'cy-requirement', country_id: 'cy', category: 'Trademark', procedure: 'Registration', description: 'Trademark Application Requirements in Cyprus:\n* Information of the applicant: name, address, and nationality.\n* A signed POA.\n* Classes and specifications of Goods/Services.\n* Priority document (if claiming priority).\n* Mark representation (Logo).\n* Passport copy (if applicant is an individual).' }];
      let markup = renderToStaticMarkup(React.createElement(Document, { invoice: data, requirements, qrDataUrl, verificationUrl: 'https://aiptconnect.aiptlaw.com/invoice/verify/0123456789abcdef0123456789abcdef0123456789abcdef' }));
      markup = markup.replace(/src="(\/images\/[^"]+)"/g, (_, src) => 'src="data:image/' + (src.endsWith('.svg') ? 'svg+xml' : 'png') + ';base64,' + fs.readFileSync(path.join(root, 'public', src)).toString('base64') + '"');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body><main class="quotation-document">${markup}</main></body></html>`;
      fs.writeFileSync(path.join(tmp, variant + '.html'), html);
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode())); });
      assert.equal(await page.locator('.quotation-office').count(), 16);
      const showDiscount = data.discount !== 0, showVat = data.total_vat !== 0;
      assert.equal(await page.locator('.quotation-fees th').filter({hasText: /^Discount/}).count(), Number(showDiscount));
      assert.equal(await page.locator('.quotation-fees th').filter({hasText: /^VAT/}).count(), Number(showVat));
      assert.equal(await page.locator('.quotation-totals > div').filter({hasText: 'Total VAT'}).count(), Number(showVat));
      assert.equal(await page.locator('.quotation-fees th').count(), 6 + Number(showDiscount) + Number(showVat));
      assert.equal(await page.locator('.quotation-fees tbody tr:first-child td').count(), 6 + Number(showDiscount) + Number(showVat));
      assert.equal(await page.locator('.quotation-qr').getAttribute('href'), 'https://aiptconnect.aiptlaw.com/invoice/verify/0123456789abcdef0123456789abcdef0123456789abcdef');
      assert.equal(await page.locator('.quotation-logo').count(), 1);
      for (const section of ['.quotation-requirements', '.quotation-fees']) {
        const colors = await page.locator(section).evaluate(el => [getComputedStyle(el.querySelector('th')).backgroundColor, getComputedStyle(el.querySelector('td')).backgroundColor]);
        assert.equal(colors[0], colors[1], 'Table headers match their body background');
      }
      assert.equal(await page.locator('.quotation-requirements tbody tr').count(), requirements.length);
      const overflows = await page.locator('.quotation-sheet th,.quotation-sheet td,.quotation-meta dd,.quotation-totals,.quotation-due,.quotation-parties,.quotation-sender,.quotation-office p span,.quotation-office h4').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.textContent));
      assert.deepEqual(overflows, [], 'No overflowing table or metadata cells');
      await page.locator('.quotation-document').screenshot({ path: path.join(tmp, variant + '.png') });
      const pdfBytes = await page.pdf({ path: path.join(variant === 'design' ? output : tmp, `quotation-${variant}-preview.pdf`), printBackground: true, preferCSSPageSize: true });
      const pdf = await require('pdf-lib').PDFDocument.load(pdfBytes);
      if (!['long', 'design'].includes(variant)) assert.equal(pdf.getPageCount(), 1, 'Short quotations fit one A4 page');
      if (variant === 'design') assert.equal(pdf.getPageCount(), 2, 'Seven class rows are split after five rows');
      if (variant === 'long') assert.ok(pdf.getPageCount() >= 3, 'Twelve rows are split into five-row groups');
      console.log(`${variant}: ${pdf.getPageCount()} A4 page(s); no overflowing table cells`);
    }
  } finally { await browser.close(); }
}
if (process.env.SKIP_PDF_RENDER === '1') {
  console.log('Passed: quotation markup, whole-dollar formatting, approved watermark gating, and five-row page-break rules. PDF rendering skipped by request.');
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
