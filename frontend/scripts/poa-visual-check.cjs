const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const artifacts = path.join(__dirname, '..', 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('sb-davupzevvsngppcrynoj-auth-token', JSON.stringify({ access_token: 'visual-test-token', refresh_token: 'visual-test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'visual-test-user', aud: 'authenticated', role: 'authenticated', email: 'visual@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() } }));
  });
  await page.route('**/functions/v1/poa**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ countries: [
    { id: 'af', name: 'Afghanistan', abbreviation: 'AF', flag_url: null },
    { id: 'as', name: 'American Samoa', abbreviation: 'AS', flag_url: null },
  ] }) }));
  await page.route('**/api/poa/translate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: '\u0625\u064a\u0644\u0631 \u0623\u0644\u0645\u0650\u0646\u0627\u0646\u0627', address: '1697 \u0645\u062c\u0645\u0639 \u0622\u064a \u0622\u0631 \u0633\u064a\u060c \u0633\u0627\u0646\u062a\u0627 \u0643\u0631\u0648\u0632\u060c \u0645\u0627\u0646\u064a\u0644\u0627' }) }));
  await page.goto('http://localhost:3002/dev/poa-preview', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '.poa-dev-preview{position:fixed!important;inset:0!important;z-index:999999!important;overflow:auto!important;background:#f4f8fa!important}.poa-dev-preview .client-shell,.poa-dev-preview .client-main,.poa-dev-preview .client-sidebar,.poa-dev-preview .client-topbar,.poa-dev-preview footer{display:none!important}.poa-dev-preview .poa-generator-grid{grid-template-columns:minmax(460px,.8fr) minmax(794px,1.2fr)!important}.poa-dev-preview .poa-page{display:block!important}.poa-dev-preview .poa-generated-docx .docx{height:297mm!important;min-height:297mm!important;box-sizing:border-box!important;overflow:hidden!important}' });
  await page.locator('.poa-page').waitFor();
  console.log('PAGE_STYLE', await page.locator('.poa-page').evaluate(el => ({ fontFamily: getComputedStyle(el).fontFamily, box: el.getBoundingClientRect().toJSON() })));
  console.log('DEV_ROUTE', page.url());
  await page.locator('.poa-applicant-fields input:not([lang])').first().fill('eiler alminana');
  await page.locator('.poa-applicant-fields textarea:not([lang])').first().fill('1697 Irc compond santa cruz manila');
  const arabicNameField = page.locator('input[lang="ar"]');
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await arabicNameField.fill('\u0627\u0633\u0645 \u064a\u062f\u0648\u064a');
  await page.locator('.poa-applicant-fields input:not([lang])').first().fill('eiler alminana updated');
  await page.waitForTimeout(900);
  console.log('MANUAL_EDIT_PERSISTS_TYPING', await arabicNameField.inputValue());
  await page.getByLabel('Licensing or licensing cancellation of trademarks').check();
  await page.getByLabel('Concessions').check();
  await page.getByLabel('Afghanistan').check();
  await page.getByLabel('American Samoa').check();
  console.log('MANUAL_EDIT_PERSISTS_SELECTION', await arabicNameField.inputValue());
  console.log('AR_SUMMARIES', await page.locator('.poa-arabic-summary').allTextContents());
  await page.getByLabel('I confirm that all fields are filled correctly.').check();
  await page.getByRole('button', { name: /Generate POA/ }).click();
  await page.locator('.poa-generated-docx .docx').waitFor({ timeout: 10000 });
  await page.evaluate(() => window.scrollTo(0,0));
  const apostilleText = await page.locator('.poa-generated-docx .docx').innerText();
  console.log('APOSTILLE_ARABIC_VALUES', apostilleText.includes('\u0627\u0633\u0645 \u064a\u062f\u0648\u064a'), apostilleText.includes('1697'), apostilleText.includes('\u062a\u0631\u062e\u064a\u0635 \u0623\u0648 \u0627\u0644\u063a\u0627\u0621 \u062a\u0631\u062e\u064a\u0635 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645'), apostilleText.includes('\u0623\u0641\u063a\u0627\u0646\u0633\u062a\u0627\u0646\u060c\u0633\u0627\u0645\u0648\u0627 \u0627\u0644\u0623\u0645\u0631\u064a\u0643\u064a\u0629'));
  await page.screenshot({ path: path.join(artifacts, 'poa-apostille-1440x900.png'), fullPage: false });
  const a4 = await page.locator('.poa-generated-docx .docx').first().evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight }));
  console.log('APOSTILLE_A4', JSON.stringify(a4));
  await page.getByLabel('Simply Signed: single column').check();
  await page.locator('.poa-page').waitFor();
  console.log('PAGE_STYLE', await page.locator('.poa-page').evaluate(el => ({ fontFamily: getComputedStyle(el).fontFamily, box: el.getBoundingClientRect().toJSON() })));
  await page.locator('.poa-page').waitFor();
  console.log('PAGE_STYLE', await page.locator('.poa-page').evaluate(el => ({ fontFamily: getComputedStyle(el).fontFamily, box: el.getBoundingClientRect().toJSON() })));
  await page.locator('.poa-applicant-fields input:not([lang])').first().fill('eiler alminana');
  await page.locator('.poa-applicant-fields textarea:not([lang])').first().fill('1697 Irc compond santa cruz manila');
  await page.locator('.poa-page').waitFor();
  console.log('PAGE_STYLE', await page.locator('.poa-page').evaluate(el => ({ fontFamily: getComputedStyle(el).fontFamily, box: el.getBoundingClientRect().toJSON() })));
  await page.getByRole('button', { name: /Generate POA/ }).click();
  await page.waitForTimeout(1000);
  console.log('SIMPLY_GENERATION_ERROR', await page.locator('.poa-error').allTextContents(), 'PREVIEW_COUNT', await page.locator('.poa-generated-docx .docx').count());
  await page.locator('.poa-generated-docx .docx').waitFor({ timeout: 10000 });
  await page.evaluate(() => window.scrollTo(0,0));
  const simpleText = await page.locator('.poa-generated-docx .docx').innerText();
  console.log('SIMPLY_SIGNED_SAMPLE', simpleText.includes('eiler alminana'), simpleText.includes('1697 Irc compond santa cruz manila'));
  await page.screenshot({ path: path.join(artifacts, 'poa-simply-signed-1440x900.png'), fullPage: false });
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors));
  console.log('SCREENSHOTS', path.join(artifacts, 'poa-apostille-1440x900.png'), path.join(artifacts, 'poa-simply-signed-1440x900.png'));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
