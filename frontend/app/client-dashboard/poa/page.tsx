'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { renderAsync } from 'docx-preview';
import { fetchSupabaseFunction, getActiveSession } from '../../../src/lib/supabase/browser';
import { getPoaArabicCountryName, translatePoaServicesToArabic } from '../../../src/lib/poa-arabic';
import { useAutoArabic } from '../../../src/lib/useAutoArabic';
import { inferPoaColumn, paragraphAlignment, preparePoaDirection, replaceDocumentText, findUnresolvedPoaPlaceholder, type PoaTemplateId, type PoaValues } from '../../../src/lib/poa-docx';
import './poa.css';

type Country = { id: string; name: string; abbreviation: string };
type Template = { id: PoaTemplateId; label: string; filename: string; path: string };

const templates: Template[] = [
  { id: 'apostille', label: 'GPOA Apostille', filename: 'GPOAApostil .docx', path: '/templates/GPOAApostil%20.docx' },
  { id: 'simply-signed', label: 'GPOA Simply Signed', filename: 'GPOA - Simply Signed.docx', path: '/templates/GPOA%20-%20Simply%20Signed.docx' },
];
const services = ['Registration', 'Renewal', 'Recording of change of name or change of address', 'Assignment', 'Licensing or licensing cancellation of trademarks', 'Goods limitation', 'Amendment of the trademark logo', 'Cancellation of trademarks', 'Goods cancellation', 'Protection of trademarks, patents, industrial designs and copyrights', 'Concessions'];
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function ensureWordElement(document: Document, parent: Element, name: string) {
  let element = Array.from(parent.children).find((child) => child.namespaceURI === w && child.localName === name);
  if (!element) { element = document.createElementNS(w, `w:${name}`); parent.insertBefore(element, parent.firstElementChild); }
  return element;
}

function setWordValue(element: Element, value: string) { element.setAttributeNS(w, 'w:val', value); }

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
  const arabicServices = selectedServices.length ? translatePoaServicesToArabic(selectedServices) : '';
  const arabicCountries = selectedCountries.length ? countries.filter((item) => selectedCountries.includes(item.id)).map((item) => getPoaArabicCountryName(item.abbreviation)).join('، ') : '';
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
      const zip = await JSZip.loadAsync(templateBuffer.current);
      const values: PoaValues = { name: applicantName.trim(), address: applicantAddress.trim(), services: selectedServices.join(', '), countries: countries.filter((item) => selectedCountries.includes(item.id)).map((item) => item.name).join(', ') };
      const arabic: PoaValues = { name: nameArabic.trim(), address: addressArabic.trim(), services: translatePoaServicesToArabic(selectedServices), countries: countries.filter((item) => selectedCountries.includes(item.id)).map((item) => getPoaArabicCountryName(item.abbreviation)).join('، ') };
      const xmlFiles = Object.keys(zip.files).filter((path) => /^word\/.*\.xml$/.test(path));
      for (const path of xmlFiles) {
        const file = zip.file(path); if (!file) continue;
        const xml = new DOMParser().parseFromString(await file.async('text'), 'application/xml');
        if (xml.getElementsByTagName('parsererror').length) throw Error(`Invalid template XML: ${path}`);
        preparePoaDirection(xml, templateId);
        for (const paragraph of Array.from(xml.getElementsByTagNameNS(w, 'p'))) {
          const text = Array.from(paragraph.getElementsByTagNameNS(w, 't')).map((node) => node.textContent || '').join('');
          const column = inferPoaColumn(text);
          const replacements = column === 'arabic' ? arabic : values;
          replaceDocumentText(paragraph, replacements);
          setWordValue(ensureWordElement(xml, paragraph, 'jc'), paragraphAlignment(templateId, text, column));
        }
        const output = new XMLSerializer().serializeToString(xml);
        if (findUnresolvedPoaPlaceholder(output)) throw Error(`A required template field remains unresolved in ${path}.`);
        zip.file(path, output);
      }
      setGeneratedBlob(await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to generate the POA document.'); }
    finally { setGenerating(false); }
  };

  useEffect(() => {
    if (!generatedBlob || !documentRef.current || !stylesRef.current) return;
    let active = true;
    const target = documentRef.current; const styles = stylesRef.current;
    setRendering(true); setRenderError('');
    void renderAsync(generatedBlob, target, styles, { inWrapper: true, hideWrapperOnPrint: false, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, experimental: false, renderHeaders: false, renderFooters: false })
      .then(() => { if (active) target.setAttribute('data-rendered', 'true'); })
      .catch((cause) => { if (active) setRenderError(cause instanceof Error ? cause.message : 'Unable to preview the generated document.'); })
      .finally(() => { if (active) setRendering(false); });
    return () => { active = false; target.replaceChildren(); styles.replaceChildren(); };
  }, [generatedBlob]);

  const download = () => { if (!generatedBlob) return; const url = URL.createObjectURL(generatedBlob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `POA-${applicantName.trim().replace(/[^a-z0-9-_]+/gi, '-')}.docx`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const reset = () => { setApplicantName(''); setApplicantAddress(''); nameTranslation.onEdit(''); addressTranslation.onEdit(''); setSelectedServices([]); setSelectedCountries([]); setConfirmed(false); setError(''); setGeneratedBlob(null); };

  return <main className="poa-page client-poa-page"><div className="poa-generator-grid">
    <section className="poa-generator-form-panel" aria-label="POA application form">
      <section className="poa-choice-section poa-applicant-card"><div className="poa-section-heading"><span aria-hidden="true">♙</span><h1>Applicant</h1></div><div className="poa-applicant-fields">
        <div className="poa-applicant-field"><label>Applicant Name <b>*</b><input value={applicantName} onChange={(event) => { setApplicantName(event.target.value); setGeneratedBlob(null); }} placeholder="Enter applicant or company name" /></label>{applicantName.trim() && <span className="poa-complete" role="status">✓ Applicant Name completed: {applicantName.trim()}</span>}<label className="poa-arabic-field">Applicant Name (Arabic)<div className="poa-arabic-edit-row"><input ref={arabicNameRef} dir="rtl" lang="ar" style={{ textAlign: 'right', unicodeBidi: 'plaintext' }} value={nameArabic} readOnly={!editingArabicName} onChange={(event) => { setNameArabic(event.target.value); setGeneratedBlob(null); }} placeholder="Arabic applicant name" /><button type="button" onClick={() => { setEditingArabicName((value) => !value); if (!editingArabicName) requestAnimationFrame(() => arabicNameRef.current?.focus()); }}>{editingArabicName ? 'Done' : 'Edit'}</button></div></label></div>
        <div className="poa-applicant-field"><label>Applicant Address <b>*</b><textarea value={applicantAddress} onChange={(event) => { setApplicantAddress(event.target.value); setGeneratedBlob(null); }} placeholder="Enter complete applicant address..." /></label>{applicantAddress.trim() && <span className="poa-complete" role="status">✓ Applicant Address completed: {applicantAddress.trim()}</span>}<label className="poa-arabic-field">Applicant Address (Arabic)<div className="poa-arabic-edit-row"><textarea ref={arabicAddressRef} dir="rtl" lang="ar" style={{ textAlign: 'right', unicodeBidi: 'plaintext' }} value={addressArabic} readOnly={!editingArabicAddress} onChange={(event) => { setAddressArabic(event.target.value); setGeneratedBlob(null); }} placeholder="Arabic applicant address" /><button type="button" onClick={() => { setEditingArabicAddress((value) => !value); if (!editingArabicAddress) requestAnimationFrame(() => arabicAddressRef.current?.focus()); }}>{editingArabicAddress ? 'Done' : 'Edit'}</button></div></label></div>
      </div></section>
      <section className="poa-choice-section"><div className="poa-section-heading"><span aria-hidden="true">⚙</span><h2>Services</h2><button type="button" onClick={() => setSelectedServices(selectedServices.length === services.length ? [] : [...services])}>{selectedServices.length === services.length ? 'Clear All' : 'Select All'}</button></div><div className="poa-check-grid">{services.map((service) => <label key={service}><input type="checkbox" checked={selectedServices.includes(service)} onChange={() => toggle(selectedServices, service, setSelectedServices)} />{service}</label>)}</div>{selectedServices.length > 0 && <p className="poa-complete poa-choice-complete" role="status">✓ Services selected: {selectedServices.join(', ')}</p>}</section>
      <section className="poa-choice-section"><div className="poa-section-heading"><span aria-hidden="true">◎</span><h2>Countries</h2><button type="button" disabled={!countries.length} onClick={() => setSelectedCountries(selectedCountries.length === countries.length ? [] : countries.map((country) => country.id))}>{selectedCountries.length === countries.length && countries.length ? 'Clear All' : 'Select All'}</button></div><input className="poa-country-search" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder="Search countries" aria-label="Search countries" /><div className="poa-check-grid poa-country-grid">{loadingCountries ? <span className="poa-no-countries">Loading available countries...</span> : filteredCountries.map((country) => <label key={country.id}><input type="checkbox" checked={selectedCountries.includes(country.id)} onChange={() => toggle(selectedCountries, country.id, setSelectedCountries)} />{country.name}</label>)}{!loadingCountries && !filteredCountries.length && <span className="poa-no-countries">{countryError || 'No countries available for your account.'}</span>}</div>{selectedCountries.length > 0 && <p className="poa-complete poa-choice-complete" role="status">✓ Countries selected: {countries.filter((item) => selectedCountries.includes(item.id)).map((item) => item.name).join(', ')}</p>}</section>
      <section className="poa-choice-section"><div className="poa-section-heading"><span aria-hidden="true">⚖</span><h2>Type of POA</h2></div><div className="poa-type-options">{templates.map((template) => <label className={templateId === template.id ? 'selected' : ''} key={template.id}><input type="radio" name="poa-type" checked={templateId === template.id} onChange={() => { setTemplateId(template.id); setGeneratedBlob(null); }} /><span className={`poa-layout-icon ${template.id}`} aria-hidden="true"><i>EN</i>{template.id === 'apostille' && <i>AR</i>}</span><span><strong>{template.label}</strong><small>{template.id === 'apostille' ? 'English + Arabic' : 'English document'}</small></span></label>)}</div></section>
      <label className="poa-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm that all fields are filled correctly.</label>
      <div className="poa-form-actions"><button type="button" disabled={!ready} onClick={() => void generate()}>{generating ? 'Generating...' : 'Generate POA'}</button><button type="button" onClick={reset}>Reset</button></div>
      {!ready && !error && <p className="poa-required-hint">Required: {[...required, !confirmed && 'confirmation', !templateBuffer.current && 'template'].filter(Boolean).join(', ')}</p>}
      {countryError && <p className="poa-error" role="alert">{countryError}</p>}{error && <p className="poa-error" role="alert">{error}</p>}
    </section>
    <section className="poa-preview-panel" aria-label="Document preview"><div className="poa-section-heading"><span aria-hidden="true">▤</span><h2>Document Preview</h2><span className="poa-live-badge">✓ Live Preview</span></div><div className="poa-preview-toolbar"><button type="button" onClick={() => setZoom((value) => Math.max(60, value - 10))} aria-label="Zoom out">−</button><span>{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(150, value + 10))} aria-label="Zoom in">+</button><button type="button" onClick={() => setZoom(100)}>100%</button><span className="poa-toolbar-divider" /><button type="button" disabled={!generatedBlob} onClick={download}>Download DOCX</button><button type="button" disabled={!generatedBlob} onClick={() => window.print()}>Print / Save PDF</button></div><div className="poa-preview-document-name">{currentTemplate.filename}</div><div className="poa-preview-canvas"><div className="poa-generated-styles" ref={stylesRef} /><div className="poa-generated-docx" ref={documentRef} style={{ zoom: zoom / 100 }} />{rendering && <div className="poa-preview-status" role="status"><span className="poa-spinner" />Rendering document...</div>}{renderError && <p className="poa-preview-error" role="alert">Preview failed: {renderError}</p>}{!generatedBlob && <p className="poa-preview-placeholder">Generate the POA to preview the completed Word document.</p>}</div></section>
  </div></main>;
}

export default function ClientPoaRoute() { return <ClientPoaPage />; }
