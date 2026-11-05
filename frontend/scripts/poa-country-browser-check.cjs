const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
let browser;

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('sb-davupzevvsngppcrynoj-auth-token', JSON.stringify({
    access_token: 'local-poa-test-token', refresh_token: 'local-poa-test-refresh', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'poa-test-user', aud: 'authenticated', role: 'authenticated', email: 'poa@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  })));
  await page.route('**/functions/v1/poa**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ countries: [
    { id: 'bnx', name: 'Benelux', abbreviation: 'BNX', flag_url: null },
    { id: 'al', name: 'Albania', abbreviation: 'ALB', flag_url: null },
    { id: 'dz', name: 'Algeria', abbreviation: 'DZA', flag_url: null },
  ] }) }));
  await page.route('**/api/poa/translate', async route => {
    const { kind } = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ arabic: kind === 'name' ? 'إيلر ألمِينانا' : 'مبنى 123، طريق الملك فهد، الجزائر 12214' }) });
  });
  await page.goto('http://localhost:3000/dev/poa-preview', { waitUntil: 'networkidle' });
  await page.locator('.poa-applicant-fields').waitFor();
  await page.locator('.poa-applicant-fields input:not([lang])').first().fill('eiler alminana');
  await page.locator('.poa-applicant-fields textarea:not([lang])').first().fill('Building 123, King Fahd Road, Algeria 12214');
  await page.getByLabel('Registration').check();
  for (const name of ['Benelux', 'Albania', 'Algeria']) await page.getByRole('checkbox', { name, exact: true }).check();
  await page.getByLabel('I confirm that all fields are filled correctly.').check();
  await page.waitForFunction(() => document.querySelector('input[lang="ar"]')?.value && document.querySelector('textarea[lang="ar"]')?.value);
  const arabicSummary = await page.locator('.poa-arabic-summary').filter({ hasText: 'الدول المحددة' }).innerText();
  const countryError = await page.locator('.poa-country-translation-error').count();
  const generate = page.getByRole('button', { name: /Generate POA/ });
  const enabled = await generate.isEnabled();
  console.log('BNX_SUMMARY', arabicSummary);
  console.log('COUNTRY_TRANSLATION_ERROR_COUNT', countryError);
  console.log('GENERATE_ENABLED', enabled);
  if (countryError || !enabled || !arabicSummary.includes('بنلوكس')) throw new Error('Benelux country summary did not pass.');
  await generate.click();
  await page.locator('.poa-generated-docx .docx').waitFor({ timeout: 15000 });
  const docText = await page.locator('.poa-generated-docx .docx').innerText();
  if (!docText.includes('بنلوكس')) throw new Error('Generated Apostille is missing the Arabic Benelux value.');
  const arabicCells = await page.locator('.poa-generated-docx .docx td').evaluateAll(cells => cells.map(cell => cell.innerText).filter(text => /[\u0600-\u06ff]/.test(text)));
  const arabicCellsContainLatin = arabicCells.some(text => /[A-Za-z]/.test(text));
  if (arabicCellsContainLatin) throw new Error(`Arabic table cell contains Latin letters: ${JSON.stringify(arabicCells)}`);
  const portalText = await page.locator('nextjs-portal').evaluateAll(nodes => nodes.map(node => node.shadowRoot?.innerText || '').join('\n'));
  const errorOverlay = /Build Error|Runtime Error|Unhandled Runtime Error/i.test(portalText);
  if (errorOverlay || pageErrors.length) throw new Error(`Runtime error overlay/page error: ${JSON.stringify(pageErrors)}`);
  const out = path.join(__dirname, '../artifacts/poa-bnx-country-1440x900.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  console.log('GENERATED_ARABIC_COUNTRIES_PRESENT', docText.includes('بنلوكس'));
  console.log('ARABIC_CELLS_NO_LATIN', !arabicCellsContainLatin);
  console.log('NEXTJS_ERROR_OVERLAY', errorOverlay);
  console.log('PAGE_ERRORS', JSON.stringify(pageErrors));
  console.log('SCREENSHOT', out);
  await browser.close();
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
