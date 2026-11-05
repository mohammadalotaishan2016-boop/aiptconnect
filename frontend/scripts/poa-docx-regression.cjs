const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const JSZip = require('jszip');
const xmljs = require('xml-js');

const sourcePath = path.join(__dirname, '../src/lib/poa-docx.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const helperUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const EN_VALUES = { name: 'eiler alminana', address: '1697 Irc compond santa cruz manila', services: 'Licensing or licensing cancellation of trademarks, Concessions', countries: 'Afghanistan, American Samoa' };
const AR_VALUES = { name: 'إيلر ألمِينانا', address: '1697 مجمع آي آر سي، سانتا كروز، مانيلا', services: 'ترخيص أو الغاء ترخيص الاستخدام،الإمتيازات', countries: 'أفغانستان،ساموا الأمريكية' };
const P_EN = { '$application name': EN_VALUES.name, '$application address': EN_VALUES.address, '$services': EN_VALUES.services, '$countries': EN_VALUES.countries };
const P_AR = { '$application name': AR_VALUES.name, '$application address': AR_VALUES.address, '$services': AR_VALUES.services, '$countries': AR_VALUES.countries };

function decode(value) { return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function encode(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function descendants(node, name) { return (node.elements || []).flatMap(child => child.name === name ? [child, ...descendants(child, name)] : descendants(child, name)); }
function textOf(node) { return descendants(node, 'w:t').map(item => item.elements?.map(child => child.text || '').join('') || item.text || '').join(''); }
function visit(node, callback) { callback(node); for (const child of node.elements || []) visit(child, callback); }
function getText(node) { return textOf(node); }
function setAttr(node, name, value) { node.attributes ||= {}; node.attributes[name] = value; }
function removeChild(node, name) { node.elements = (node.elements || []).filter(child => child.name !== name); }
function textValue(node) { return (node.elements || []).filter(child => child.type === 'text').map(child => child.text || '').join('') || node.text || ''; }
function setTextValue(node, value) { node.elements = [{ type: 'text', text: value }]; delete node.text; }
function replaceParagraph(node, replacements) {
  const texts = descendants(node, 'w:t');
  const runs = texts.map(text => { let parent = text.parent; while (parent && parent.name !== 'w:r') parent = parent.parent; return parent; });
  const sourceText = texts.map(textValue).join('');
  const map = [];
  texts.forEach((text, nodeIndex) => { const value = textValue(text); for (let offset=0;offset<value.length;offset++) map.push({nodeIndex,offset,run:runs[nodeIndex]}); });
  const output = texts.map(text => [...textValue(text)]);
  const rx = /\$\s*(application[\s\u00a0]+name|application[\s\u00a0]+address|services|countries)/gi;
  for (const match of sourceText.matchAll(rx)) {
    const canonical = `$${match[1].replace(/[\s\u00a0]+/g,' ').toLowerCase()}`;
    assert.ok(typeof replacements[canonical] === 'string' && replacements[canonical].trim(), `missing ${canonical}`);
    const start=match.index, end=start+match[0].length, first=map[start];
    for(let pos=start;pos<end;pos++){const loc=map[pos];output[loc.nodeIndex][loc.offset]='';}
    output[first.nodeIndex][first.offset]=replacements[canonical];
    const run=first.run;
    if(run && /application name|application address|countries/.test(canonical)){
      let rPr=(run.elements||[]).find(child=>child.name==='w:rPr');
      if(!rPr){rPr={type:'element',name:'w:rPr',elements:[],parent:run};run.elements||=[];run.elements.unshift(rPr)}
      let bold=(rPr.elements||[]).find(child=>child.name==='w:b');
      if(!bold){bold={type:'element',name:'w:b',parent:rPr};rPr.elements.push(bold)}
    }
  }
  texts.forEach((text,index)=>setTextValue(text,output[index].join('')));
  for(const run of new Set(runs.filter(Boolean))){
    const runTexts=descendants(run,'w:t');
    if(runTexts.every(text=>!textValue(text)) && (run.elements||[]).every(child=>['w:rPr','w:t'].includes(child.name))) run.parent.elements=run.parent.elements.filter(child=>child!==run);
  }
}
function prepareXmlDirection(root, template) {
  if (template === 'simply-signed') {
    visit(root, node => {
      if (node.name === 'w:style' && node.attributes?.['w:styleId'] === 'Normal') {
        const pPr = (node.elements || []).find(child => child.name === 'w:pPr'); if (pPr) removeChild(pPr, 'w:bidi');
      }
      if (node.name === 'w:pPr') removeChild(node, 'w:bidi');
      if (node.name === 'w:rPr') removeChild(node, 'w:rtl');
      if (node.name === 'w:sectPr') { removeChild(node, 'w:bidi'); removeChild(node, 'w:rtlGutter'); }
      if (node.name === 'w:tblPr') removeChild(node, 'w:bidiVisual');
    });
  }
  if (template === 'apostille') {
    visit(root, node => {
      if (node.name === 'w:tblPr') removeChild(node, 'w:bidiVisual');
      if (node.name === 'w:tr') {
        const cells = (node.elements || []).filter(child => child.name === 'w:tc');
        if (cells.length >= 2 && /[\u0600-\u06ff]/.test(textOf(cells[0])) && /[A-Za-z]/.test(textOf(cells[1]))) {
          const first = cells[0], second = cells[1];
          const i = node.elements.indexOf(first), j = node.elements.indexOf(second);
          node.elements[i] = second; node.elements[j] = first;
        }
      }
    });
  }
}
function transformXml(root, template, helpers) {
  prepareXmlDirection(root, template);
  const replacementMaps = new WeakMap();
  if (template === 'apostille') visit(root, node => {
    if (node.name !== 'w:tc') return;
    const text = textOf(node);
    const arabic = /[\u0600-\u06ff]/.test(text);
    replacementMaps.set(node, arabic ? P_AR : P_EN);
  });
  visit(root, node => {
    if (node.name !== 'w:p') return;
    const text = textOf(node);
    let cell = node.parent;
    while (cell && cell.name !== 'w:tc') cell = cell.parent;
    const arabic = /[\u0600-\u06ff]/.test(text) || (!/[A-Za-z]/.test(text) && Boolean(cell && /[\u0600-\u06ff]/.test(textOf(cell))));
    const alignment = helpers.paragraphAlignment(template, text, arabic ? 'arabic' : 'english');
    let pPr = (node.elements || []).find(child => child.name === 'w:pPr');
    if (!pPr) { pPr = { type: 'element', name: 'w:pPr', elements: [], parent: node }; node.elements ||= []; node.elements.unshift(pPr); }
    let jc = (pPr.elements || []).find(child => child.name === 'w:jc');
    if (!jc) { jc = { type: 'element', name: 'w:jc', parent: pPr }; pPr.elements ||= []; pPr.elements.push(jc); }
    setAttr(jc, 'w:val', alignment);
    const pPrIndex = node.elements.indexOf(pPr);
    node.elements.splice(pPrIndex, 1);
    node.elements.unshift(pPr);
    let bidi = (pPr.elements || []).find(child => child.name === 'w:bidi'); if (!bidi) { bidi = { type: 'element', name: 'w:bidi', parent: pPr }; pPr.elements.push(bidi); } setAttr(bidi, 'w:val', arabic ? '1' : '0');
    for (const run of descendants(node, 'w:r')) {
      let rPr = (run.elements || []).find(child => child.name === 'w:rPr'); if (!rPr) { rPr = { type: 'element', name: 'w:rPr', elements: [], parent: run }; run.elements ||= []; run.elements.unshift(rPr); }
      let rtl = (rPr.elements || []).find(child => child.name === 'w:rtl');
      if (arabic) { if (!rtl) { rtl = { type: 'element', name: 'w:rtl', parent: rPr }; rPr.elements ||= []; rPr.elements.push(rtl); } setAttr(rtl, 'w:val', '1'); }
      else if (rtl) removeChild(rPr, 'w:rtl');
    }
    const replacements = arabic ? P_AR : P_EN;
    const localized = arabic ? { ...replacements, '$application address': helpers.isolateArabicValues(replacements['$application address']) } : replacements;
    replaceParagraph(node, localized);
    node._text = text;
  });
}

(async () => {
  const helpers = await import(helperUrl);
  const { assertSignatureOrder, enforceNoLeadingPunctuation, findUnresolvedPoaPlaceholder, paragraphAlignment, replaceTextRuns, isolateArabicValues, getPoaReplacements } = helpers;
  assert.equal(helpers.replaceTextRuns(['Applicant: $application ', 'address and $services', ' in $countries'], { ...P_EN, '$application address': 'Example Address', '$services': 'Registration, Renewal', '$countries': 'Saudi Arabia, Bahrain' }).join(''), 'Applicant: Example Address and Registration, Renewal in Saudi Arabia, Bahrain');
  assert.throws(() => getPoaReplacements({ ...AR_VALUES, name: '' }, 'arabic'), /arabic value.*missing/i, 'generation rejects missing Arabic values');
  assert.equal(isolateArabicValues('1697 Ù…Ø¬Ù…Ø¹ AIRT'), '\u20661697\u2069 Ù…Ø¬Ù…Ø¹ \u2066AIRT\u2069');
  assert.equal(paragraphAlignment('simply-signed', 'body text'), 'both');
  assert.equal(paragraphAlignment('simply-signed', 'NAME:'), 'left');
  assert.equal(paragraphAlignment('apostille', 'English paragraph', 'english'), 'both');
  assert.equal(paragraphAlignment('apostille', 'Arabic paragraph', 'arabic'), 'both');
  assert.equal(paragraphAlignment('apostille', 'Power of Attorney (POA)'), 'center');
  assert.equal(isolateArabicValues('Afghanistan'), '\u2066Afghanistan\u2069');
  const fixtureRun = (value, bold = false, italic = false) => ({ type:'element', name:'w:r', elements:[...(bold||italic?[{type:'element',name:'w:rPr',elements:[...(bold?[{type:'element',name:'w:b'}]:[]),...(italic?[{type:'element',name:'w:i'}]:[])]}]:[]),{type:'element',name:'w:t',elements:[{type:'text',text:value}]}] });
  for (const withProofErr of [false,true]) {
    const first=fixtureRun('$application',false,true), middle=fixtureRun(' ',true), last=fixtureRun('name');
    const fixture={type:'element',name:'w:p',elements:withProofErr?[first,{type:'element',name:'w:proofErr',attributes:{'w:type':'spellStart'}},middle,last]:[first,middle,last]};
    visit(fixture,node=>{for(const child of node.elements||[])child.parent=node});
    replaceParagraph(fixture,{'$application name':'eiler alminana'});
    const fixtureText=descendants(fixture,'w:t').map(textValue).join('');
    assert.equal(fixtureText,'eiler alminana','split placeholder fixture replaced once');
    assert.ok(!fixtureText.includes('$'),'split fixture has no leftover placeholder');
    assert.ok(first.elements.some(item=>item.name==='w:rPr'&&item.elements.some(prop=>prop.name==='w:i')&&item.elements.some(prop=>prop.name==='w:b')),'first run formatting is retained and replacement is bold');
  }
  assert.equal(enforceNoLeadingPunctuation('.This POA'), false);
  assert.equal(enforceNoLeadingPunctuation('NAME:'), true);

  const templateFiles = ['GPOA - Simply Signed.docx', 'GPOAApostil .docx'];
  for (const filename of templateFiles) {
    const template = filename.includes('Apostil') ? 'apostille' : 'simply-signed';
    const original = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, '../public/templates', filename)));
    const generated = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, '../public/templates', filename)));
    const xml = await generated.file('word/document.xml').async('text');
    const parsed = xmljs.xml2js(xml, { compact: false, addParent: true });
    const initialArabic = [];
    visit(parsed, node => { if (node.name === 'w:tc' && /[\u0600-\u06ff]/.test(textOf(node))) initialArabic.push(...descendants(node, 'w:p').filter(p => /[\u0600-\u06ff]/.test(textOf(p))).map(textOf)); });
    transformXml(parsed, template, helpers);
    const generatedArabic = [];
    visit(parsed, node => { if (node.name === 'w:tc' && /[\u0600-\u06ff]/.test(textOf(node))) generatedArabic.push(...descendants(node, 'w:p').filter(p => /[\u0600-\u06ff]/.test(textOf(p))).map(textOf)); });
    assert.equal(initialArabic.length, generatedArabic.length, `${filename}: Arabic paragraph count must be stable`);
    assert.equal(generatedArabic.length, initialArabic.length, `${filename}: Arabic paragraph count is stable`);
    generated.file('word/document.xml', xmljs.js2xml(parsed, { compact: false, spaces: 0 }));
    const output = await JSZip.loadAsync(await generated.generateAsync({ type: 'nodebuffer' }));
    const outputDoc = xmljs.xml2js(await output.file('word/document.xml').async('text'), { compact: false, addParent: true });
    const paragraphs = descendants(outputDoc, 'w:p');
    const texts = paragraphs.map(getText);
    const visible = texts.filter(text => text.trim());
    const invalid = visible.filter(text => !enforceNoLeadingPunctuation(text));
    assert.deepEqual(invalid, [], `${filename}: no paragraph may begin with punctuation`);
    assert.ok(texts.every(text => !findUnresolvedPoaPlaceholder(text)), `${filename}: no unresolved placeholders`);
    assert.ok(texts.every(text => !text.includes('$')), `${filename}: no dollar placeholders remain`);
    const documentXml = xmljs.xml2js(await output.file('word/document.xml').async('text'), { compact:false, addParent:true });
    for(const section of descendants(documentXml,'w:sectPr')){
      const size=descendants(section,'w:pgSz')[0];
      assert.equal(size?.attributes?.['w:w'],'11906',`${filename}: A4 page width`);
      assert.equal(size?.attributes?.['w:h'],'16838',`${filename}: A4 page height`);
    }
    const originalSections=xmljs.xml2js(await original.file('word/document.xml').async('text'),{compact:false,addParent:true});
    assert.deepEqual(descendants(documentXml,'w:pgMar').map(item=>item.attributes),descendants(originalSections,'w:pgMar').map(item=>item.attributes),`${filename}: template margins unchanged`);
    const originalDoc = xmljs.xml2js(await original.file('word/document.xml').async('text'),{compact:false,addParent:true});
    assert.equal(descendants(documentXml,'w:p').length,descendants(originalDoc,'w:p').length,`${filename}: paragraph structure unchanged`);
    assert.equal(descendants(documentXml,'w:br').length + descendants(documentXml,'w:cr').length,descendants(originalDoc,'w:br').length + descendants(originalDoc,'w:cr').length,`${filename}: explicit line breaks unchanged`);
    if (template === 'simply-signed') {
      assert.ok(assertSignatureOrder(texts), 'Simply Signed signature labels must end NAME, SIGNATURE, DATE');
      assert.ok(texts.join('\n').includes(EN_VALUES.name) && texts.join('\n').includes(EN_VALUES.address) && texts.join('\n').includes(EN_VALUES.services) && texts.join('\n').includes(EN_VALUES.countries), 'Simply Signed contains all English values');
    }
    else {
      const table = descendants(outputDoc, 'w:tbl')[0];
      assert.ok(table, 'Apostille must retain a table');
      assert.equal(descendants(table, 'w:bidiVisual').length, 0, 'Apostille normalization removes bidiVisual after reordering cells');
      for (const row of descendants(table, 'w:tr')) {
        const cells = (row.elements || []).filter(child => child.name === 'w:tc');
        if (cells.length < 2) continue;
        assert.doesNotMatch(textOf(cells[0]), /[\u0600-\u06ff]/, 'first Apostille cell must be English');
        assert.match(textOf(cells[1]), /[\u0600-\u06ff]/, 'second Apostille cell must be Arabic');
      }
      for (const paragraph of paragraphs) {
        let parent = paragraph.parent;
        while (parent && parent.name !== 'w:tc') parent = parent.parent;
        if (!parent) continue;
        const arabic = /[\u0600-\u06ff]/.test(textOf(parent));
        const pPr = (paragraph.elements || []).find(child => child.name === 'w:pPr');
        const jc = (pPr?.elements || []).find(child => child.name === 'w:jc');
        const bidi = (pPr?.elements || []).find(child => child.name === 'w:bidi');
        assert.ok(bidi, 'every Apostille paragraph explicitly sets w:bidi');
        assert.equal(bidi.attributes?.['w:val'], arabic ? '1' : '0', 'paragraph bidi matches its language');
        const text = textOf(paragraph);
        if (/[\u0600-\u06ff]/.test(text)) {
          const runs = descendants(paragraph, 'w:r').filter(run => /[\u0600-\u06ff]/.test(textOf(run)));
          assert.ok(runs.length > 0 && runs.every(run => descendants(run, 'w:rtl').length > 0), 'Arabic text runs all have w:rtl');
        }
        if (arabic) assert.ok(['both', 'center'].includes(jc?.attributes?.['w:val']), `Arabic paragraphs preserve template alignment (${jc?.attributes?.['w:val']})`);
        else assert.ok(['both', 'center'].includes(jc?.attributes?.['w:val']), 'English paragraphs preserve template alignment');
      }
      const cells = descendants(table, 'w:tr').flatMap(row => (row.elements || []).filter(child => child.name === 'w:tc'));
      const englishText = paragraphs.map(textOf).filter(text => /[A-Za-z]/.test(text) && !/[\u0600-\u06ff]/.test(text)).join('\n');
      const arabicText = paragraphs.map(textOf).filter(text => /[\u0600-\u06ff]/.test(text)).join('\n');
      const plainArabicText = arabicText.replace(/[\u2066-\u2069]/g, '');
      assert.ok(englishText.includes(EN_VALUES.name) && englishText.includes(EN_VALUES.address) && englishText.includes(EN_VALUES.services) && englishText.includes(EN_VALUES.countries), 'English cells retain all English input values');
      assert.ok(plainArabicText.includes(AR_VALUES.name) && plainArabicText.includes(AR_VALUES.address) && arabicText.includes(AR_VALUES.services) && arabicText.includes(AR_VALUES.countries), 'Arabic cells use the separate Arabic value set');
      const visibleArabicCell = arabicText.replace(/[\u2066-\u2069]/g, '');
      assert.doesNotMatch(visibleArabicCell, /[A-Za-z]/, 'Arabic cells contain no Latin letters');
      assert.ok(arabicText.includes('\u20661697\u2069'), 'Arabic address digits are isolated individually');
      assert.ok(texts.some(text => text.includes(AR_VALUES.countries)), 'Arabic country value is present');
      const rows = descendants(table, 'w:tr');
      assert.ok(rows.length >= 2, 'Apostille table must contain aligned paragraph rows');
    }
    assert.equal(await original.file('word/document.xml').async('text'), await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, '../public/templates', filename))).then(z => z.file('word/document.xml').async('text')), 'Template must not be modified');
    console.log(`${filename}: PASS XML direction, alignment, placeholder, punctuation, and Arabic-order assertions (${(await output.generateAsync({ type: 'nodebuffer' })).length} bytes)`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

