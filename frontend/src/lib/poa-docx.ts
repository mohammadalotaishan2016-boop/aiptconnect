export type PoaTemplateId = 'apostille' | 'simply-signed';
export type PoaColumn = 'english' | 'arabic' | 'single';

export const POA_PLACEHOLDERS = ['$application name', '$application address', '$services', '$countries'] as const;
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export type PoaValues = { name: string; address: string; services: string; countries: string };

export async function generatePoaDocx(type: PoaTemplateId, english: PoaValues, arabic: PoaValues, template: ArrayBuffer): Promise<Blob> {
  for (const [label, values] of [['English', english], ['Arabic', arabic]] as const) {
    for (const [key, value] of Object.entries(values)) if (!value.trim()) throw new Error(`Generation stopped: ${label} ${key} is missing.`);
  }
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(template);
  const replacements = {
    english: { '$application name': english.name, '$application address': english.address, '$services': english.services, '$countries': english.countries },
    arabic: { '$application name': arabic.name, '$application address': arabic.address, '$services': arabic.services, '$countries': arabic.countries },
  };
  for (const path of Object.keys(zip.files).filter((name) => /^word\/.*\.xml$/.test(name))) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = new DOMParser().parseFromString(await file.async('text'), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error(`Invalid template XML: ${path}`);
    normalizeA4PageSize(xml);
    preparePoaDirection(xml, type);
    for (const paragraph of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p'))) {
      const text = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('');
      let cell: Element | null = paragraph;
      while (cell && !(cell.namespaceURI === WORD_NS && cell.localName === 'tc')) cell = cell.parentElement;
      const cellText = cell ? Array.from(cell.getElementsByTagNameNS(WORD_NS, 't')).map((node) => node.textContent || '').join('') : text;
      const column = /[\u0600-\u06ff]/.test(cellText) ? 'arabic' : 'english';
      replaceDocumentText(paragraph, replacements[column]);
    }
    normalizePoaTextDirection(xml);
    normalizePoaFonts(xml);
    const output = new XMLSerializer().serializeToString(xml);
    if (findUnresolvedPoaPlaceholder(output)) throw new Error(`A required template field remains unresolved in ${path}.`);
    zip.file(path, output);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function getPoaReplacements(values: PoaValues, column: 'english' | 'arabic') {
  const selected = {
    '$application name': values.name,
    '$application address': values.address,
    '$services': values.services,
    '$countries': values.countries,
  };
  for (const [placeholder, value] of Object.entries(selected)) {
    if (!value?.trim()) throw new Error(`Generation stopped: the ${column} value for ${placeholder} is missing.`);
  }
  return selected;
}

export function replaceTextRuns(runText: string[], replacements: Record<string, string>) {
  const fullText = runText.join('');
  const ownerByCharacter: number[] = [];
  runText.forEach((value, index) => { for (let offset = 0; offset < value.length; offset++) ownerByCharacter.push(index); });
  const output = runText.map(() => '');
  const replaceAt = (start: number, length: number, value: string) => {
    const firstOwner = ownerByCharacter[start];
    if (firstOwner === undefined) return;
    output[firstOwner] += value;
    for (let index = start + 1; index < start + length; index++) {
      const owner = ownerByCharacter[index];
      if (owner !== undefined) output[owner] += '\u0000';
    }
  };
  let offset = 0;
  while (offset < fullText.length) {
    const placeholder = POA_PLACEHOLDERS.find(key => fullText.startsWith(key, offset));
    const splitMatch = placeholder || /\s/.test(fullText[offset] || '') ? null : POA_PLACEHOLDERS.map(key => {
      let cursor = offset;
      let compact = '';
      while (cursor < fullText.length && compact.length <= key.replace(/\s/g, '').length) {
        if (!/\s/.test(fullText[cursor])) compact += fullText[cursor];
        cursor++;
        if (compact === key.replace(/\s/g, '')) return { key, end: cursor };
        if (!key.replace(/\s/g, '').startsWith(compact)) break;
      }
      return null;
    }).find(Boolean);
    const splitPlaceholder = placeholder || splitMatch?.key;
    const owner = ownerByCharacter[offset];
    if (splitPlaceholder) {
      const replacement = replacements[splitPlaceholder];
      if (typeof replacement !== 'string' || !replacement.trim()) throw new Error(`Generation stopped: no value was supplied for ${splitPlaceholder}.`);
      const end = placeholder ? offset + splitPlaceholder.length : splitMatch!.end;
      const owners = [...new Set(ownerByCharacter.slice(offset, end))];
      const placeholderIsOnlyContentInItsRuns = owners.length > 0 && owners.every(runIndex => {
        let runStart = 0;
        for (let index = 0; index < runIndex; index++) runStart += runText[index].length;
        const runEnd = runStart + runText[runIndex].length;
        return runStart >= offset && runEnd <= end;
      });
      if (placeholderIsOnlyContentInItsRuns) {
        if (owner !== undefined) output[owner] += replacement;
        for (const runIndex of owners) if (runIndex !== owner) output[runIndex] += '\u0000';
      } else replaceAt(offset, end - offset, replacement);
      offset = end;
    } else {
      if (owner !== undefined) output[owner] += fullText[offset];
      offset++;
    }
  }
  return output.map(value => value.replace(/\u0000/g, ''));
}

export function replaceDocumentText(paragraph: Element, replacements: Record<string, string>) {
  const textNodes = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't'));
  const nodes = textNodes.map((text) => {
    let run = text.parentElement;
    while (run && run.namespaceURI === WORD_NS && run.localName !== 'r') run = run.parentElement;
    return { text, run, value: text.textContent || '' };
  });
  const combined = nodes.map((node) => node.value).join('');
  const characterMap: Array<{ nodeIndex: number; offset: number; run: Element | null }> = [];
  nodes.forEach((node, nodeIndex) => { for (let offset = 0; offset < node.value.length; offset++) characterMap.push({ nodeIndex, offset, run: node.run }); });
  const output = nodes.map((node) => [...node.value]);
  const pattern = /\$\s*(application[\s\u00a0]+name|application[\s\u00a0]+address|services|countries)/gi;
  for (const match of combined.matchAll(pattern)) {
    const start = match.index!;
    const end = start + match[0].length;
    const canonical = `$${match[1].replace(/[\s\u00a0]+/g, ' ').toLowerCase()}`;
    const replacement = replacements[canonical];
    if (typeof replacement !== 'string' || !replacement.trim()) throw new Error(`Generation stopped: no value was supplied for ${canonical}.`);
    const first = characterMap[start];
    if (!first) throw new Error(`Generation stopped: could not map ${canonical} to a Word run.`);
    const touchedRuns = new Set<Element>();
    for (let index = start; index < end; index++) {
      const location = characterMap[index];
      output[location.nodeIndex][location.offset] = '';
      if (location.run) touchedRuns.add(location.run);
    }
    output[first.nodeIndex][first.offset] = replacement;
    const run = first.run;
    if (run && (canonical.endsWith('application name') || canonical.endsWith('application address') || canonical.endsWith('countries'))) {
      let properties = Array.from(run.children).find((child) => child.namespaceURI === WORD_NS && child.localName === 'rPr');
      if (!properties) { properties = run.ownerDocument!.createElementNS(WORD_NS, 'w:rPr'); run.insertBefore(properties, run.firstChild); }
      const bold = Array.from(properties.children).find((child) => child.namespaceURI === WORD_NS && child.localName === 'b') || run.ownerDocument!.createElementNS(WORD_NS, 'w:b');
      if (!bold.parentNode) properties.appendChild(bold);
    }
  }
  nodes.forEach((node, index) => {
    const value = output[index].join('');
    node.text.textContent = value;
    if (value) node.text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  });
  for (const run of new Set(nodes.map((node) => node.run))) {
    if (!run) continue;
    const texts = Array.from(run.getElementsByTagNameNS(WORD_NS, 't'));
    const hasVisibleText = texts.some((text) => Boolean(text.textContent));
    const hasNonTextContent = Array.from(run.children).some((child) => !['rPr', 't'].includes(child.localName));
    if (!hasVisibleText && !hasNonTextContent) run.parentNode?.removeChild(run);
  }
}

export function paragraphAlignment(template: PoaTemplateId, text: string, column: PoaColumn = 'single'): 'center' | 'right' | 'left' | 'both' {
  if (text.includes('Power of Attorney (POA)')) return 'center';
  if (template === 'apostille') {
    if (column === 'arabic') return 'right';
    if (/^(NAME:|SIGNATURE:|DATE:)$/.test(text.trim())) return 'left';
    return 'both';
  }
  if (template === 'simply-signed') return /^(NAME:|SIGNATURE:|DATE:)$/.test(text.trim()) ? 'left' : 'both';
  return 'both';
}

export function inferPoaColumn(cellText: string): PoaColumn {
  if (/[\u0600-\u06ff]/.test(cellText)) return 'arabic';
  if (/[A-Za-z]/.test(cellText)) return 'english';
  return 'single';
}

function getOrCreate(parent: Element, localName: string, before?: Element | null) {
  const existing = Array.from(parent.children).find(child => child.namespaceURI === WORD_NS && child.localName === localName);
  if (existing) return existing;
  const element = parent.ownerDocument!.createElementNS(WORD_NS, `w:${localName}`);
  parent.insertBefore(element, before ?? null);
  return element;
}

function setOnOff(parent: Element, localName: string, enabled: boolean) {
  const element = getOrCreate(parent, localName);
  if (!enabled) element.parentNode?.removeChild(element);
  else element.setAttributeNS(WORD_NS, 'w:val', '1');
}

function normalizeEnglishRun(run: Element) {
  const properties = getOrCreate(run, 'rPr', run.firstElementChild?.localName === 'rPr' ? run.firstElementChild : null);
  setOnOff(properties, 'rtl', false);
}

function setParagraphProperties(paragraph: Element, alignmentValue: string, rtl: boolean, makeTitleBold = false) {
  const properties = getOrCreate(paragraph, 'pPr', paragraph.firstElementChild?.localName === 'pPr' ? paragraph.firstElementChild : null);
  const alignment = getOrCreate(properties, 'jc');
  alignment.setAttributeNS(WORD_NS, 'w:val', alignmentValue);
  const bidi = getOrCreate(properties, 'bidi');
  bidi.setAttributeNS(WORD_NS, 'w:val', rtl ? '1' : '0');
  Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 'r')).forEach(run => {
    if (!rtl) normalizeEnglishRun(run);
    else {
      const runProperties = getOrCreate(run, 'rPr', run.firstElementChild?.localName === 'rPr' ? run.firstElementChild : null);
      const runRtl = getOrCreate(runProperties, 'rtl');
      runRtl.setAttributeNS(WORD_NS, 'w:val', '1');
    }
    if (makeTitleBold) {
      const runProperties = getOrCreate(run, 'rPr', run.firstElementChild?.localName === 'rPr' ? run.firstElementChild : null);
      setOnOff(runProperties, 'b', true);
    }
  });
}

export function preparePoaDirection(document: Document, template: PoaTemplateId) {
  if (template === 'simply-signed') {
    const normalStyle = Array.from(document.getElementsByTagNameNS(WORD_NS, 'style')).find(style => style.getAttributeNS(WORD_NS, 'styleId') === 'Normal');
    const styleParagraphProperties = normalStyle && Array.from(normalStyle.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'pPr');
    if (styleParagraphProperties) setOnOff(styleParagraphProperties, 'bidi', false);
    for (const properties of Array.from(document.getElementsByTagNameNS(WORD_NS, 'pPr'))) setOnOff(properties, 'bidi', false);
    for (const properties of Array.from(document.getElementsByTagNameNS(WORD_NS, 'rPr'))) setOnOff(properties, 'rtl', false);
    for (const section of Array.from(document.getElementsByTagNameNS(WORD_NS, 'sectPr'))) {
      setOnOff(section, 'bidi', false);
      setOnOff(section, 'rtlGutter', false);
      const margins = getOrCreate(section, 'pgMar');
      margins.setAttributeNS(WORD_NS, 'w:top', '1417');
      margins.setAttributeNS(WORD_NS, 'w:bottom', '1417');
      margins.setAttributeNS(WORD_NS, 'w:left', '1134');
      margins.setAttributeNS(WORD_NS, 'w:right', '1134');
      margins.setAttributeNS(WORD_NS, 'w:header', '709');
      margins.setAttributeNS(WORD_NS, 'w:footer', '709');
      margins.setAttributeNS(WORD_NS, 'w:gutter', '0');
    }
  }
  for (const table of Array.from(document.getElementsByTagNameNS(WORD_NS, 'tbl'))) {
    const properties = Array.from(table.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'tblPr');
    if (!properties) continue;
    const bidiVisual = Array.from(properties.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'bidiVisual');
    if (template !== 'apostille') continue;
    // docx-preview does not apply Word's visual bidi column reversal reliably.
    // Convert the effective Word order (English-left, Arabic-right) to physical
    // cell order and remove bidiVisual as one atomic transformation.
    for (const row of Array.from(table.getElementsByTagNameNS(WORD_NS, 'tr'))) {
      const cells = Array.from(row.children).filter(child => child.namespaceURI === WORD_NS && child.localName === 'tc');
      if (cells.length < 2) continue;
      const firstText = Array.from(cells[0].getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
      const secondText = Array.from(cells[1].getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
      if (/[\u0600-\u06ff]/.test(firstText) && /[A-Za-z]/.test(secondText)) row.insertBefore(cells[1], cells[0]);
    }
    bidiVisual?.parentNode?.removeChild(bidiVisual);
  }
  if (template === 'apostille') {
    // The section-level RTL flag reverses the physical table a second time in
    // docx-preview even after bidiVisual is removed and cells are normalized.
    for (const section of Array.from(document.getElementsByTagNameNS(WORD_NS, 'sectPr'))) {
      setOnOff(section, 'bidi', false);
      setOnOff(section, 'rtlGutter', false);
    }
  }
}

export function normalizeA4PageSize(document: Document) {
  for (const section of Array.from(document.getElementsByTagNameNS(WORD_NS, 'sectPr'))) {
    const pageSize = getOrCreate(section, 'pgSz');
    pageSize.setAttributeNS(WORD_NS, 'w:w', '11906');
    pageSize.setAttributeNS(WORD_NS, 'w:h', '16838');
  }
}

export function normalizePoaFonts(document: Document) {
  const runs = Array.from(document.getElementsByTagNameNS(WORD_NS, 'r'));
  for (const run of runs) {
    let paragraph: Element | null = run;
    while (paragraph && !(paragraph.namespaceURI === WORD_NS && paragraph.localName === 'p')) paragraph = paragraph.parentElement;
    const hasArabic = /[\u0600-\u06ff]/.test(paragraph?.textContent || '');
    const properties = getOrCreate(run, 'rPr', run.firstElementChild?.localName === 'rPr' ? run.firstElementChild : null);
    const fonts = getOrCreate(properties, 'rFonts');
    const font = hasArabic ? 'Times New Roman' : 'Calibri';
    for (const attribute of ['ascii', 'hAnsi', 'cs', 'eastAsia']) fonts.setAttributeNS(WORD_NS, `w:${attribute}`, font);
  }
  const defaults = document.getElementsByTagNameNS(WORD_NS, 'docDefaults')[0];
  if (defaults) {
    const runDefault = getOrCreate(defaults, 'rPrDefault');
    const defaultRun = getOrCreate(runDefault, 'rPr');
    const fonts = getOrCreate(defaultRun, 'rFonts');
    for (const attribute of ['ascii', 'hAnsi', 'cs', 'eastAsia']) fonts.setAttributeNS(WORD_NS, `w:${attribute}`, 'Calibri');
    for (const sizeName of ['sz', 'szCs']) getOrCreate(defaultRun, sizeName).setAttributeNS(WORD_NS, 'w:val', '22');
    const paragraphDefault = getOrCreate(defaults, 'pPrDefault');
    const defaultParagraph = getOrCreate(paragraphDefault, 'pPr');
    const spacing = getOrCreate(defaultParagraph, 'spacing');
    spacing.setAttributeNS(WORD_NS, 'w:after', '200');
    spacing.setAttributeNS(WORD_NS, 'w:line', '276');
    spacing.setAttributeNS(WORD_NS, 'w:lineRule', 'auto');
  }
}

export function normalizePoaTextDirection(document: Document) {
  for (const paragraph of Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const rtl = /[\u0600-\u06ff]/.test(paragraph.textContent || '');
    const properties = getOrCreate(paragraph, 'pPr', paragraph.firstElementChild?.localName === 'pPr' ? paragraph.firstElementChild : null);
    if (rtl) getOrCreate(properties, 'bidi').setAttributeNS(WORD_NS, 'w:val', '1');
    else {
      const bidi = Array.from(properties.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'bidi');
      bidi?.parentNode?.removeChild(bidi);
    }
    for (const run of Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 'r'))) {
      const runProperties = getOrCreate(run, 'rPr', run.firstElementChild?.localName === 'rPr' ? run.firstElementChild : null);
      if (rtl) getOrCreate(runProperties, 'rtl').setAttributeNS(WORD_NS, 'w:val', '1');
      else {
        const rtlElement = Array.from(runProperties.children).find((child) => child.namespaceURI === WORD_NS && child.localName === 'rtl');
        rtlElement?.parentNode?.removeChild(rtlElement);
      }
      const language = getOrCreate(runProperties, 'lang');
      if (rtl) {
        language.removeAttributeNS(WORD_NS, 'val');
        language.setAttributeNS(WORD_NS, 'w:bidi', 'ar-SA');
      } else {
        language.setAttributeNS(WORD_NS, 'w:val', 'en-US');
        language.removeAttributeNS(WORD_NS, 'bidi');
      }
    }
  }
}

export function inferArabicCell(paragraph: Element) {
  const cell = paragraph.parentElement?.parentElement?.localName === 'tc' ? paragraph.parentElement.parentElement : null;
  return Boolean(cell && /[\u0600-\u06ff]/.test(Array.from(cell.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('')));
}

export function classifyApostilleParagraph(paragraph: Element) {
  const text = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
  if (/[\u0600-\u06ff]/.test(text)) return 'arabic' as const;
  if (/[A-Za-z]/.test(text)) return 'english' as const;
  const cellText = paragraph.parentElement?.parentElement?.localName === 'tc'
    ? Array.from(paragraph.parentElement.parentElement.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('')
    : '';
  return /[\u0600-\u06ff]/.test(cellText) ? 'arabic' as const : 'english' as const;
}

export function normalizeApostilleDirection(document: Document) {
  for (const style of Array.from(document.getElementsByTagNameNS(WORD_NS, 'style'))) {
    const pPr = Array.from(style.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'pPr');
    if (pPr) setOnOff(pPr, 'bidi', false);
    for (const rPr of Array.from(style.getElementsByTagNameNS(WORD_NS, 'rPr'))) setOnOff(rPr, 'rtl', false);
  }
  for (const paragraph of Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const text = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
    const arabic = classifyApostilleParagraph(paragraph) === 'arabic';
    setParagraphProperties(paragraph, paragraphAlignment('apostille', text, arabic ? 'arabic' : 'english'), arabic, text.includes('Power of Attorney (POA)'));
  }
  // Match the requested page inset while keeping equal physical columns.
  for (const table of Array.from(document.getElementsByTagNameNS(WORD_NS, 'tbl'))) {
    const properties = getOrCreate(table, 'tblPr', table.firstElementChild?.localName === 'tblPr' ? table.firstElementChild : null);
    const width = getOrCreate(properties, 'tblW');
    width.setAttributeNS(WORD_NS, 'w:w', '9638');
    width.setAttributeNS(WORD_NS, 'w:type', 'dxa');
    const indent = getOrCreate(properties, 'tblInd');
    indent.setAttributeNS(WORD_NS, 'w:w', '0');
    indent.setAttributeNS(WORD_NS, 'w:type', 'dxa');
    const grid = Array.from(table.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'tblGrid');
    const columns = grid ? Array.from(grid.children).filter(child => child.namespaceURI === WORD_NS && child.localName === 'gridCol') : [];
    for (const column of columns.slice(0, 2)) column.setAttributeNS(WORD_NS, 'w:w', '4819');
  }
  for (const cell of Array.from(document.getElementsByTagNameNS(WORD_NS, 'tc'))) {
    const text = Array.from(cell.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
    const arabic = /[\u0600-\u06ff]/.test(text);
    const properties = getOrCreate(cell, 'tcPr', cell.firstElementChild?.localName === 'tcPr' ? cell.firstElementChild : null);
    const width = getOrCreate(properties, 'tcW');
    width.setAttributeNS(WORD_NS, 'w:w', '4819');
    width.setAttributeNS(WORD_NS, 'w:type', 'dxa');
    const margins = getOrCreate(properties, 'tcMar');
    for (const [side, amount] of [['top', '227'], ['bottom', '227'], [arabic ? 'left' : 'right', '284']] as const) {
      const margin = getOrCreate(margins, side);
      margin.setAttributeNS(WORD_NS, 'w:w', amount);
      margin.setAttributeNS(WORD_NS, 'w:type', 'dxa');
    }
  }
  const defaults = Array.from(document.getElementsByTagNameNS(WORD_NS, 'docDefaults'))[0];
  if (defaults) {
    for (const rPr of Array.from(defaults.getElementsByTagNameNS(WORD_NS, 'rPr'))) setOnOff(rPr, 'rtl', false);
    for (const pPr of Array.from(defaults.getElementsByTagNameNS(WORD_NS, 'pPr'))) setOnOff(pPr, 'bidi', false);
  }
}

export function isolateArabicValues(value: string) {
  return value.replace(/\d+|[A-Za-z][A-Za-z0-9-]*/g, (code) => `\u2066${code}\u2069`);
}

export function enforceNoLeadingPunctuation(text: string) {
  const visible = text.replace(/[\u200e\u200f\u2066-\u2069\s]+/g, '');
  return !/^[:.,;]/.test(visible);
}

export function findUnresolvedPoaPlaceholder(text: string) {
  return POA_PLACEHOLDERS.find(placeholder => text.toLowerCase().includes(placeholder)) || text.match(/\$[^\s,;.!?]*/)?.[0];
}

export function assertSignatureOrder(paragraphs: string[]) {
  const visible = paragraphs.map(value => value.trim()).filter(Boolean);
  return visible.slice(-3).join('|') === 'NAME:|SIGNATURE:|DATE:';
}
