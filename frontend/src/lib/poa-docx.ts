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
    if (type === 'apostille') normalizeApostilleDirection(xml);
    else normalizeSimplySignedLayout(xml);
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
  if (template === 'apostille') {
    if (text.includes(String.fromCharCode(1608,1603,1575,1604,1577))) return 'center';
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    if (/^(?:\u0623\u0646\u0627 \u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u062f\u0646\u0627\u0647:|\u0627\u0644\u0645\u0642\u064a\u0645 \u0641\u064a:?|\u0627\u0644\u0627\u0633\u0645:|\u0627\u0644\u062a\u0648\u0642\u064a\u0639:|\u0627\u0644\u062a\u0627\u0631\u064a\u062e:)$/.test(normalizedText)) return 'right';
    if (column === 'arabic') return 'both';
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
  if (rtl) getOrCreate(properties, 'bidi').setAttributeNS(WORD_NS, 'w:val', '1');
  else {
    const bidi = Array.from(properties.children).find(child => child.namespaceURI === WORD_NS && child.localName === 'bidi');
    bidi?.parentNode?.removeChild(bidi);
  }
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
    const properties = getOrCreate(run, 'rPr', run.firstElementChild?.localName === 'rPr' ? run.firstElementChild : null);
    const fonts = getOrCreate(properties, 'rFonts');
    for (const attribute of ['ascii', 'hAnsi', 'cs', 'eastAsia']) fonts.setAttributeNS(WORD_NS, `w:${attribute}`, 'Times New Roman');
  }
  const defaults = document.getElementsByTagNameNS(WORD_NS, 'docDefaults')[0];
  if (defaults) {
    const runDefault = getOrCreate(defaults, 'rPrDefault');
    const defaultRun = getOrCreate(runDefault, 'rPr');
    const fonts = getOrCreate(defaultRun, 'rFonts');
    for (const attribute of ['ascii', 'hAnsi', 'cs', 'eastAsia']) fonts.setAttributeNS(WORD_NS, `w:${attribute}`, 'Times New Roman');
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
  for (const row of Array.from(document.getElementsByTagNameNS(WORD_NS, 'tr'))) {
    const properties = getOrCreate(row, 'trPr', row.firstElementChild);
    setOnOff(properties, 'cantSplit', true);
  }
  for (const paragraph of Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const text = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
    const arabic = classifyApostilleParagraph(paragraph) === 'arabic';
    const row = paragraph.parentElement?.parentElement;
    const firstRow = row?.namespaceURI === WORD_NS && row.localName === 'tr'
      && Array.from(document.getElementsByTagNameNS(WORD_NS, 'tr'))[0] === row;
    const header = text.includes('Power of Attorney (POA)') || /\u0648\u0643\u0627\u0644\u0629/.test(text);
    setParagraphProperties(paragraph, header ? 'center' : paragraphAlignment('apostille', text, arabic ? 'arabic' : 'english'), arabic, header);
  }
}

export function normalizeSimplySignedLayout(document: Document) {
  for (const paragraph of Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const text = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't')).map(node => node.textContent || '').join('');
    setParagraphProperties(paragraph, paragraphAlignment('simply-signed', text), false, text.includes('Power of Attorney (POA)'));
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
