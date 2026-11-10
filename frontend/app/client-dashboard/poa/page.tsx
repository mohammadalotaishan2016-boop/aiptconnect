'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { fetchSupabaseFunction, getActiveSession } from '../../../src/lib/supabase/browser';
import { countriesToArabic, translatePoaServicesToArabic, joinArabicPoaValues } from '../../../src/lib/poa-arabic';
import { Check } from 'lucide-react';
import { useAutoArabic } from '../../../src/lib/useAutoArabic';
import { generatePoaDocx, isolateArabicValues, paragraphAlignment, type PoaTemplateId, type PoaValues } from '../../../src/lib/poa-docx';
import './poa.css';

type Country = { id: string; name: string; abbreviation: string };
type Template = { id: PoaTemplateId; label: string; filename: string; path: string };

const templates: Template[] = [
  { id: 'apostille', label: 'GPOA Apostille', filename: 'GPOAApostil .docx', path: '/templates/GPOAApostil%20.docx' },
  { id: 'simply-signed', label: 'GPOA Simply Signed', filename: 'GPOA - Simply Signed.docx', path: '/templates/GPOA%20-%20Simply%20Signed.docx' },
];
const services = ['Registration', 'Renewal', 'Recording of change of name or change of address', 'Assignment', 'Licensing or licensing cancellation of trademarks', 'Goods limitation or cancellation', 'Amendment of the trademark logo', 'Cancellation of trademarks', 'Protection of trademarks, patents, industrial designs and copyrights', 'Concessions'];

function normalizeApostillePreview(root: HTMLElement) {
  const arabicPattern = /[\u0600-\u06ff]/;
  for (const table of Array.from(root.querySelectorAll('table'))) {
    table.dir = 'ltr';
    for (const row of Array.from(table.querySelectorAll('tr'))) {
      const cells = Array.from(row.children).filter((child): child is HTMLTableCellElement => child instanceof HTMLTableCellElement);
      if (cells.length < 2) continue;
      const firstIsArabic = arabicPattern.test(cells[0].textContent || '');
      const secondIsEnglish = /[A-Za-z]/.test(cells[1].textContent || '');
      if (firstIsArabic && secondIsEnglish) row.insertBefore(cells[1], cells[0]);
      for (const cell of cells) {
        const isArabic = arabicPattern.test(cell.textContent || '');
        cell.dir = isArabic ? 'rtl' : 'ltr';
        cell.lang = isArabic ? 'ar' : 'en';
        cell.style.unicodeBidi = 'isolate';
        for (const paragraph of Array.from(cell.querySelectorAll('p'))) {
          const paragraphArabic = arabicPattern.test(paragraph.textContent || '');
          paragraph.dir = paragraphArabic ? 'rtl' : 'ltr';
          paragraph.lang = paragraphArabic ? 'ar' : 'en';
          paragraph.style.unicodeBidi = 'isolate';
          paragraph.style.textAlign = paragraphAlignment('apostille', paragraph.textContent || '', paragraphArabic ? 'arabic' : 'english');
        }
      }
    }
  }
}

function ClientPoaPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countryError, setCountryError] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [applicantAddress, setApplicantAddress] = useState('');
  const nameTranslation = useAutoArabic(applicantName, 'name');
  const addressTranslation = useAutoArabic(applicantAddress, 'address');
  const nameArabic = nameTranslation.arabic;
  const addressArabic = addressTranslation.arabic;
  const [editingArabicName, setEditingArabicName] = useState(false);
  const [editingArabicAddress, setEditingArabicAddress] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState('');
  const [templateId, setTemplateId] = useState<PoaTemplateId>('apostille');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [zoom, setZoom] = useState(100);
  const [generating, setGenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [renderError, setRenderError] = useState('');
  const templateBuffer = useRef<ArrayBuffer | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const arabicNameRef = useRef<HTMLInputElement>(null);
  const arabicAddressRef = useRef<HTMLTextAreaElement>(null);
  const renderToken = useRef(0);
  const currentTemplate = templates.find((item) => item.id === templateId)!;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoadingCountries(true);
      try {
        const response = await fetchSupabaseFunction('poa', { signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body.countries)) throw Error(body.error || 'Unable to load countries for your account.');
        setCountries(body.countries);
      } catch (cause) { if (!controller.signal.aborted) setCountryError(cause instanceof Error ? cause.message : 'Unable to load countries.'); }
      finally { if (!controller.signal.aborted) setLoadingCountries(false); }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    templateBuffer.current = null;
    setGeneratedBlob(null);
    void fetch(currentTemplate.path).then((response) => {
      if (!response.ok) throw Error(`Could not load ${currentTemplate.filename}.`);
      return response.arrayBuffer();
    }).then((buffer) => { if (active) { templateBuffer.current = buffer; setError(''); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the POA template.'); });
    return () => { active = false; };
  }, [currentTemplate]);

  const filteredCountries = useMemo(() => countries.filter((country) => country.name.toLowerCase().includes(countrySearch.trim().toLowerCase())), [countries, countrySearch]);
  const required = [!applicantName.trim() && 'Applicant Name', !applicantAddress.trim() && 'Applicant Address', !selectedServices.length && 'Services', !selectedCountries.length && 'Countries'].filter(Boolean) as string[];
  const orderedServices = services.filter((service) => selectedServices.includes(service));
  const translatedServices = orderedServices.length ? translatePoaServicesToArabic(orderedServices) : '';
  const orderedCountries = countries.filter((item) => selectedCountries.includes(item.id));
  const countryCodesKey = orderedCountries.map((item) => item.abbreviation).join('|');
  const arabicCountryResult = useMemo(() => {
    if (!countryCodesKey) return { value: '', error: '' };
    try { return { value: countriesToArabic(orderedCountries.map((item) => item.abbreviation)), error: '' }; }
    catch (cause) { return { value: '', error: cause instanceof Error ? cause.message : 'Unable to translate the selected countries.' }; }
  }, [countryCodesKey]);
  const arabicCountries = arabicCountryResult.value;
  const joinedArabic = joinArabicPoaValues(translatedServices ? [translatedServices] : [], arabicCountries ? [arabicCountries] : []);
  const arabicServices = joinedArabic.services;
  const arabicValuesReady = Boolean(nameArabic.trim() && addressArabic.trim() && arabicServices.trim() && arabicCountries.trim());
  const translationsBusy = ['pending', 'loading'].includes(nameTranslation.status) || ['pending', 'loading'].includes(addressTranslation.status);
  const ready = !required.length && confirmed && arabicValuesReady && !translationsBusy && Boolean(templateBuffer.current) && !loadingCountries && !generating;
  const toggle = (items: string[], value: string, setter: (value: string[]) => void) => setter(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);

  const generate = async () => {
    if (!templateBuffer.current) { setError('The selected POA template is still loading.'); return; }
    if (required.length) { setError(`Complete the required fields: ${required.join(', ')}.`); return; }
    if (!confirmed) { setError('Confirm that the applicant details are correct before generating the POA.'); return; }
    setGenerating(true); setError(''); setGeneratedBlob(null);
    try {
      const values: PoaValues = { name: applicantName.trim(), address: applicantAddress.trim(), services: orderedServices.join(', '), countries: orderedCountries.map((item) => item.name).join(', ') };
      const arabic: PoaValues = { name: nameArabic.trim(), address: isolateArabicValues(addressArabic.trim()), services: arabicServices, countries: joinedArabic.countries };
      setGeneratedBlob(await generatePoaDocx(templateId, values, arabic, templateBuffer.current));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to generate the POA document.'); }
    finally { setGenerating(false); }
  };

  useEffect(() => {
    if (!generatedBlob || !documentRef.current || !stylesRef.current) return;
    let active = true;
    const token = ++renderToken.current;
    const target = documentRef.current; const styles = stylesRef.current;
    setRendering(true); setRenderError('');
    target.replaceChildren(); styles.replaceChildren();
    const timeout = window.setTimeout(() => { if (active && renderToken.current === token) { setRendering(false); setRenderError('Preview did not finish within 15 seconds.'); } }, 15000);
    void renderAsync(generatedBlob, target, styles, { inWrapper: true, hideWrapperOnPrint: false, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false })
      .then(() => {
        if (active && renderToken.current === token) {
          if (templateId === 'apostille') normalizeApostillePreview(target);
          target.setAttribute('data-rendered', 'true');
        }
      })
      .catch((cause) => { if (active && renderToken.current === token) setRenderError(cause instanceof Error ? cause.message : 'Unable to preview the generated document.'); })
      .finally(() => { window.clearTimeout(timeout); if (active && renderToken.current === token) setRendering(false); });
    return () => { active = false; window.clearTimeout(timeout); };
  }, [generatedBlob, templateId]);

  useEffect(() => {
    if (!generatedBlob) return;
    const canvas = documentRef.current?.parentElement;
    if (!canvas) return;
    const fit = () => setZoom(Math.max(50, Math.min(100, Math.floor(((canvas.clientWidth - 32) / 794) * 100))));
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();
    return () => observer.disconnect();
  }, [generatedBlob]);

  const download = () => { if (!generatedBlob) return; const url = URL.createObjectURL(generatedBlob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `POA-${applicantName.trim().replace(/[^a-z0-9-_]+/gi, '-')}.docx`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const downloadPdf = async () => {
    if (!generatedBlob || rendering || pdfGenerating) return;
    setError('');
    setPdfGenerating(true);
    try {
      await document.fonts.ready;
      const session = await getActiveSession();
      if (!session?.access_token) throw new Error('Your session has expired. Sign in again to download the PDF.');
      const form = new FormData();
      form.set('file', generatedBlob, `POA-${applicantName.trim() || 'document'}.docx`);
      const response = await fetch('/api/poa/pdf', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form, cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload.error === 'pdf_conversion_unavailable') throw new Error('PDF conversion is not configured. Set GOTENBERG_URL to the secured Gotenberg LibreOffice service.');
        if (payload.error === 'unauthorized') throw new Error('Your session has expired. Sign in again to download the PDF.');
        throw new Error('PDF conversion failed. Please try again or use Print / Save PDF.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `POA-${applicantName.trim().replace(/[^a-z0-9-_]+/gi, '-')}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download the PDF.');
    } finally {
      setPdfGenerating(false);
    }
  };
  const fitWidth = () => {
    const canvas = documentRef.current?.parentElement;
    if (!canvas) return;
    setZoom(Math.max(50, Math.min(150, Math.floor(((canvas.clientWidth - 48) / 794) * 100))));
  };
  const reset = () => { setApplicantName(''); setApplicantAddress(''); nameTranslation.onEdit(''); addressTranslation.onEdit(''); setSelectedServices([]); setSelectedCountries([]); setConfirmed(false); setError(''); setGeneratedBlob(null); };

  const printDocument = async () => {
    if (!generatedBlob || rendering || !documentRef.current) return;
    await document.fonts.ready;
    const pages = documentRef.current.querySelectorAll('.docx');
    if (!pages.length) { setError('Wait for the Word preview to finish rendering before printing.'); return; }
    const frame = document.createElement('iframe');
    frame.title = 'POA print view';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(frame);
    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) { frame.remove(); setError('Unable to open the print view.'); return; }
    printDocument.open();
    printDocument.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="' + window.location.origin + '/"><title>POA</title></head><body></body></html>');
    printDocument.close();
    for (const sheet of Array.from(document.styleSheets)) {
      const link = printDocument.createElement('link');
      link.rel = 'stylesheet';
      if (sheet.href) link.href = sheet.href;
      else {
        try {
          const style = printDocument.createElement('style');
          style.textContent = Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
          printDocument.head.appendChild(style);
        } catch { /* Cross origin rules are skipped; local generated styles follow. */ }
      }
      if (sheet.href) printDocument.head.appendChild(link);
    }
    for (const style of Array.from(stylesRef.current?.children || [])) printDocument.head.appendChild(style.cloneNode(true));
    const printRoot = documentRef.current.cloneNode(false) as HTMLElement;
    printRoot.style.cssText = 'display:block!important;position:static!important;width:210mm!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;overflow:visible!important;transform:none!important;zoom:1!important';
    for (const page of Array.from(pages)) printRoot.appendChild(page.cloneNode(true));
    printDocument.body.appendChild(printRoot);
    const printStyle = printDocument.createElement('style');
    printStyle.textContent = '@page{size:A4 portrait;margin:0}html,body{width:210mm!important;height:auto!important;margin:0!important;padding:0!important;background:#fff!important}*,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.docx-wrapper{display:block!important;width:auto!important;min-width:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:#fff!important}.docx{box-sizing:border-box!important;width:210mm!important;min-width:210mm!important;height:auto!important;min-height:297mm!important;max-height:none!important;margin:0!important;overflow:visible!important;transform:none!important;zoom:1!important;box-shadow:none!important;break-after:page;page-break-after:always}.docx:last-child{break-after:auto;page-break-after:auto}.docx table{width:100%!important;max-width:100%!important;table-layout:fixed!important;border-collapse:collapse!important}.docx tr{break-inside:avoid!important;page-break-inside:avoid!important}.docx td,.docx th{box-sizing:border-box!important;max-width:100%!important;overflow:visible!important;overflow-wrap:anywhere!important;border:0!important}.poa-generated-docx[data-template="apostille"] .docx{padding:15.9mm 11.6mm 20.6mm 6.4mm!important}.poa-generated-docx[data-template="simply-signed"] .docx{padding:8.2mm 7.6mm 6.6mm!important}';
    printDocument.head.appendChild(printStyle);
    await new Promise<void>((resolve) => {
      const links = Array.from(printDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
      if (!links.length) { resolve(); return; }
      let remaining = links.length;
      const settled = () => { remaining -= 1; if (remaining === 0) resolve(); };
      links.forEach((link) => { link.addEventListener('load', settled, { once: true }); link.addEventListener('error', settled, { once: true }); });
    });
    await printWindow.document.fonts.ready;
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.remove(), 120_000);
  };

  return <main className="poa-page client-poa-page"><div className="poa-generator-grid">
    <section className="poa-generator-form-panel" aria-label="POA application form">
      <section className="poa-choice-section poa-applicant-card"><div className="poa-section-heading"><span aria-hidden="true">♙</span><h1>Applicant</h1></div><div className="poa-applicant-fields">
        <div className="poa-applicant-field"><label>Applicant Name <b>*</b><input value={applicantName} onChange={(event) => { setApplicantName(event.target.value); setGeneratedBlob(null); }} placeholder="Enter applicant or company name" /></label>{applicantName.trim() && <span className="poa-complete" role="status">✓ Applicant Name completed: {applicantName.trim()}</span>}<label className="poa-arabic-field">Applicant Name (Arabic)<div className="poa-arabic-edit-row"><input ref={arabicNameRef} dir="rtl" lang="ar" style={{ textAlign: 'right', unicodeBidi: 'plaintext' }} value={nameArabic} readOnly={false} onChange={(event) => { nameTranslation.onEdit(event.target.value); setGeneratedBlob(null); }} placeholder="Arabic applicant name" /><button type="button" onClick={() => { setEditingArabicName((value) => !value); if (!editingArabicName) requestAnimationFrame(() => arabicNameRef.current?.focus()); }}>{editingArabicName ? 'Done' : 'Edit'}</button></div>{["pending","loading"].includes(nameTranslation.status) && <small className="poa-translation-status">Translating…</small>}{nameTranslation.status === "error" && <small className="poa-translation-error">Translation failed, type the Arabic manually</small>}{(nameTranslation.manual || nameTranslation.status === "error") && <button type="button" className="poa-retranslate" onClick={nameTranslation.retranslate}>Re-translate</button>}</label></div>
        <div className="poa-applicant-field"><label>Applicant Address <b>*</b><textarea value={applicantAddress} onChange={(event) => { setApplicantAddress(event.target.value); setGeneratedBlob(null); }} placeholder="Enter complete applicant address..." /></label>{applicantAddress.trim() && <span className="poa-complete" role="status">✓ Applicant Address completed: {applicantAddress.trim()}</span>}<label className="poa-arabic-field">Applicant Address (Arabic)<div className="poa-arabic-edit-row"><textarea ref={arabicAddressRef} dir="rtl" lang="ar" style={{ textAlign: 'right', unicodeBidi: 'plaintext' }} value={addressArabic} readOnly={false} onChange={(event) => { addressTranslation.onEdit(event.target.value); setGeneratedBlob(null); }} placeholder="Arabic applicant address" /><button type="button" onClick={() => { setEditingArabicAddress((value) => !value); if (!editingArabicAddress) requestAnimationFrame(() => arabicAddressRef.current?.focus()); }}>{editingArabicAddress ? 'Done' : 'Edit'}</button></div>{["pending","loading"].includes(addressTranslation.status) && <small className="poa-translation-status">Translating…</small>}{addressTranslation.status === "error" && <small className="poa-translation-error">Translation failed, type the Arabic manually</small>}{(addressTranslation.manual || addressTranslation.status === "error") && <button type="button" className="poa-retranslate" onClick={addressTranslation.retranslate}>Re-translate</button>}</label></div>
      </div></section>
      <section className="poa-choice-section"><div className="poa-section-heading"><span aria-hidden="true">⚙</span><h2>Services</h2><button type="button" onClick={() => setSelectedServices(selectedServices.length === services.length ? [] : [...services])}>{selectedServices.length === services.length ? 'Clear All' : 'Select All'}</button></div><div className="poa-check-grid">{services.map((service) => <label key={service}><input type="checkbox" checked={selectedServices.includes(service)} onChange={() => toggle(selectedServices, service, setSelectedServices)} />{service}</label>)}</div>{selectedServices.length > 0 && <> <p className="poa-complete poa-choice-complete" role="status">✓ Services selected: {orderedServices.join(', ')}</p><p className="poa-arabic-summary" dir="rtl" lang="ar">✓ الخدمات المحددة: {arabicServices}</p></>}</section>
      <section className="poa-choice-section"><div className="poa-section-heading"><span aria-hidden="true">⌕</span><h2>Countries</h2><button type="button" disabled={!countries.length} onClick={() => setSelectedCountries(selectedCountries.length === countries.length ? [] : countries.map((country) => country.id))}>{selectedCountries.length === countries.length && countries.length ? 'Clear All' : 'Select All'}</button></div><input className="poa-country-search" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder="Search countries" aria-label="Search countries" /><div className="poa-check-grid poa-country-grid">{loadingCountries ? <span className="poa-no-countries">Loading available countries...</span> : filteredCountries.map((country) => <label key={country.id}><input type="checkbox" checked={selectedCountries.includes(country.id)} onChange={() => toggle(selectedCountries, country.id, setSelectedCountries)} />{country.name}</label>)}{!loadingCountries && !filteredCountries.length && <span className="poa-no-countries">{countryError || 'No countries available for your account.'}</span>}</div>{selectedCountries.length > 0 && <> <p className="poa-complete poa-choice-complete" role="status">✓ Countries selected: {orderedCountries.map((item) => item.name).join(', ')}</p>{arabicCountryResult.error ? <p className="poa-error poa-country-translation-error" role="alert">{arabicCountryResult.error}</p> : <p className="poa-arabic-summary" dir="rtl" lang="ar"><Check size={14} aria-hidden="true" /> الدول المحددة: {arabicCountries}</p>}</>}</section>
      <section className="poa-choice-section"><div className="poa-section-heading"><span aria-hidden="true">⚖</span><h2>Type of POA</h2></div><div className="poa-type-options">{templates.map((template) => <label className={templateId === template.id ? 'selected' : ''} key={template.id}><input type="radio" name="poa-type" checked={templateId === template.id} onChange={() => { setTemplateId(template.id); setGeneratedBlob(null); }} /><span className={`poa-layout-icon ${template.id}`} aria-hidden="true"><i>EN</i>{template.id === 'apostille' && <i>AR</i>}</span><span><strong>{template.label}</strong><small>{template.id === 'apostille' ? 'English + Arabic' : 'English document'}</small></span></label>)}</div></section>
      <label className="poa-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm that all fields are filled correctly.</label>
      <div className="poa-form-actions"><button type="button" disabled={!ready} onClick={() => void generate()}>{generating ? 'Generating...' : 'Generate POA'}</button><button type="button" onClick={reset}>Reset</button></div>
      {!ready && !error && <p className="poa-required-hint">Required: {[...required, !confirmed && 'confirmation', !templateBuffer.current && 'template'].filter(Boolean).join(', ')}</p>}
      {countryError && <p className="poa-error" role="alert">{countryError}</p>}{error && <p className="poa-error" role="alert">{error}</p>}
    </section>
    <section className="poa-preview-panel" aria-label="Document preview">
      <div className="poa-section-heading">
        <span aria-hidden="true">◉</span>
          <h2>Document Preview</h2>
          <span className="poa-live-badge">✓ Live Preview</span>
      </div>
      <div className="poa-preview-toolbar">
        <button type="button" onClick={() => setZoom((value) => Math.max(60, value - 10))} aria-label="Zoom out">−</button>
          <span>{zoom}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(150, value + 10))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(100)}>100%</button>
        <button type="button" onClick={fitWidth}>Fit width</button>
        <span className="poa-toolbar-divider" />
        <button type="button" disabled={!generatedBlob || rendering} onClick={download}>
          Download DOCX
        </button>
        <button type="button" disabled={!generatedBlob || rendering} onClick={() => void printDocument()}>
          Print
        </button>
  
        </div>
        <div className="poa-preview-document-name">{currentTemplate.filename}</div>
        <div className="poa-preview-canvas">
          <div className="poa-generated-styles" ref={stylesRef} />
          <div className="poa-generated-docx" data-template={templateId} ref={documentRef} style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", height: `${Math.max(1123, documentRef.current?.querySelectorAll(".docx").length || 1) * zoom / 100}px` }} />{rendering && <div className="poa-preview-status" role="status"><span className="poa-spinner" />Rendering document...
          </div>}{renderError && <p className="poa-preview-error" role="alert">Preview failed: {renderError}</p>}{!generatedBlob && <p className="poa-preview-placeholder">
            Generate the POA to preview the completed Word document.</p>}</div>
    </section>
  </div>
  </main>;
}

export default function ClientPoaRoute() { return <ClientPoaPage />; }
