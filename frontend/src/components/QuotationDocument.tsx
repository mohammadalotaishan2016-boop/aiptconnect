import QuotationOfficeFooter from './QuotationOfficeFooter';
import { quotationDisplayRows, type PricingRow } from '../../../backend/supabase/functions/_shared/quotation-class-pricing';
import { toPlainText } from '../lib/plain-text';

export type QuotationRequirement = { id: string; country_id: string; procedure: string | null; description: string; category?: string | null };
export type QuotationItem = { category?: string; requirement_ids?: string[]; class_numbers?: number[]; class_count?: number; class_type?: string | null; class_pricing_rows?: PricingRow[]; country_id: string; procedure_name: string; quantity?: number; official_fee: number; attorney_fee: number; other_fee: number; claiming_priority_fee?: number; state_fee_total?: number; vat_rate?: number; country?: { name: string } };
export type PrintableQuotation = { valid_until?: string | null; reference_no: string; invoice_date: string; grand_total: number; total_vat: number; discount: number; currency: string; client_matter_ref?: string; vatable: boolean; vat_rate: number; client?: { company_name: string; address: string }; quotation_items: QuotationItem[] };
const amount = (value: number) => (value === 0 ? 0 : value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : value;
};

/** Saved fees already include quantity and classes. Never multiply them again. */
export function quotationRow(item: QuotationItem, invoice: PrintableQuotation, index: number) {
  const multiplier = Math.max(1, Number(item.quantity || 1)) * (item.class_pricing_rows?.length ? 1 : Math.max(1, item.class_numbers?.length || item.class_count || 0));
  const extras = Number(item.other_fee || 0) + Number(item.claiming_priority_fee || 0) + Number(item.state_fee_total || 0);
  const discount = index === 0 ? Number(invoice.discount) : 0;
  const vat = invoice.vatable ? Number(item.attorney_fee) * Number(item.vat_rate ?? invoice.vat_rate) / 100 : 0;
  return { multiplier, extras, discount, vat, total: Number(item.official_fee) + Number(item.attorney_fee) + extras - discount };
}

/** Selected requirements take priority; otherwise include matching catalog requirements. */
export function quotationRequirementRows(invoice: PrintableQuotation, requirements: QuotationRequirement[]) {
  const seen = new Set<string>();
  return invoice.quotation_items.flatMap(item => {
    const matches = (requirement: QuotationRequirement) => requirement.country_id === item.country_id && requirement.procedure === item.procedure_name && (!item.category || requirement.category === item.category);
    const ids = item.requirement_ids?.length ? item.requirement_ids : requirements.filter(matches).map(requirement => requirement.id);
    return ids.flatMap(id => {
      const key = [item.country_id, item.category, item.procedure_name, id].join('|');
      if (seen.has(key)) return [];
      seen.add(key);
      const requirement = requirements.find(entry => entry.id === id && matches(entry));
      return [{ key, country: item.country?.name || '-', procedure: item.procedure_name, description: requirement ? toPlainText(requirement.description) : 'The selected requirement is no longer available for this country and procedure.' }];
    });
  });
}

export default function QuotationDocument({ invoice, requirements, qrDataUrl, verificationUrl, qrPlaceholder = "Preparing QR code..." }: { invoice: PrintableQuotation; requirements: QuotationRequirement[]; qrDataUrl: string; verificationUrl?: string; qrPlaceholder?: string }) {
  const symbol = invoice.currency === 'USD' ? '$' : invoice.currency;
  const requirementRows = quotationRequirementRows(invoice, requirements);
  const showDiscount = Number(invoice.discount || 0) !== 0;
  const showVat = Number(invoice.total_vat || 0) !== 0 || invoice.quotation_items.some(item => invoice.vatable && Number(item.attorney_fee) * Number(item.vat_rate ?? invoice.vat_rate) !== 0);
  const showClassNumbers = invoice.quotation_items.some(item =>
    (item.category === 'Trademark' || (!item.category && Boolean(item.class_count))) &&
    Boolean(item.class_numbers?.length),
  );
  const feeWidths = [19, 8, ...(showClassNumbers ? [9.5] : []), 14.5, 15, ...(showDiscount ? [10.5] : []), ...(showVat ? [10] : []), 13.5];
  const totalWidth = feeWidths.reduce((sum, width) => sum + width, 0);
  return <><div className="quotation-footer-frame"><QuotationOfficeFooter /></div><table className="quotation-pagination" role="presentation"><tbody><tr><td><article className="quotation-sheet">
    <header className="quotation-heading" aria-label="Quotation">
      <img className="quotation-logo" src="/images/aipt-quotation-logo.svg" alt="AIP&T" />
      <div className="quotation-sender"><h2>AIPT for Trademark Registration Agents</h2><p>Building No.58<br />Salah Aldin Street, Office 3, Plot 6 - Jibla Kuwait<br />Email: Info@aiptlaw.com</p></div>
      <a className="quotation-qr" href={verificationUrl} aria-label="Verify this quotation">{qrDataUrl ? <img src={qrDataUrl} alt="Quotation verification QR code" /> : <span>{qrPlaceholder}</span>}<small>Scan to verify</small></a>
    </header>
    <section className="quotation-parties">
      <div className="quotation-recipient" aria-label="Quotation recipient"><p>{toPlainText(invoice.client?.company_name) || '-'}</p><p>{toPlainText(invoice.client?.address) || '-'}</p></div>
      <dl className="quotation-meta"><div><dt>Date:</dt><dd>{date(invoice.invoice_date)}</dd></div><div><dt>Ref# Number:</dt><dd>{invoice.reference_no}</dd></div><div><dt>Client Reference:</dt><dd>{invoice.client_matter_ref || '-'}</dd></div><div><dt>Valid Until:</dt><dd>{invoice.valid_until ? new Date(invoice.valid_until).toLocaleDateString('en-US', { timeZone: 'Asia/Kuwait' }) : 'Not yet available'}</dd></div></dl>
    </section>
    <section className="quotation-requirements"><h3 className="quotation-tab">REQUIREMENTS</h3><table><colgroup><col style={{ width: '22%' }} /><col style={{ width: '25%' }} /><col /></colgroup><thead><tr><th>Country</th><th>Procedure</th><th>Description</th></tr></thead><tbody>
      {requirementRows.map(row => <tr key={row.key}><td>{row.country}</td><td>{row.procedure}</td><td>{row.description}</td></tr>)}
      {!requirementRows.length && <tr><td colSpan={3}>No applicable requirements are configured for the selected services, countries and procedures.</td></tr>}
    </tbody></table></section>
    <section className="quotation-fees"><h3 className="quotation-tab">FEE DETAILS</h3><table><colgroup>{feeWidths.map((width, index) => <col key={index} style={{ width: `${width / totalWidth * 100}%` }} />)}</colgroup><thead><tr><th>Procedure<br />(procedure)</th><th>Qty</th>{showClassNumbers && <th>Class<br />numbers</th>}<th>Official Fees<small>line amount</small></th><th>Attorney Fees<small>line amount</small></th>{showDiscount && <th>Discount<small>line amount</small></th>}{showVat && <th>VAT<small>line amount</small></th>}<th>TOTAL ({invoice.currency === 'USD' ? 'US$' : invoice.currency}){showVat && <small>before VAT</small>}</th></tr></thead><tbody>
      {invoice.quotation_items.flatMap((item, index) => quotationDisplayRows(item, invoice.vatable ? item.vat_rate ?? invoice.vat_rate : 0).map((line, lineIndex) => {
        const discount = index === 0 && lineIndex === 0 ? Number(invoice.discount) : 0;
        const total = line.official_fee + line.attorney_fee + line.other_fee - discount;
        const hasClassNumbers = Boolean(item.class_numbers?.length) &&
          (item.category === 'Trademark' || (!item.category && Boolean(item.class_count)));
        return <tr key={index + '-' + lineIndex}><td>{lineIndex === 0 && <><strong>{item.procedure_name}</strong><br />({item.country?.name || '-'})</>}<small>{line.label}</small>{line.source && <small>Fees: {line.source}</small>}{line.other_fee !== 0 && <small>Other fees: {amount(line.other_fee)}</small>}</td><td>{line.quantity}</td>{showClassNumbers && <td>{hasClassNumbers ? line.class_numbers.join(', ') || '-' : ''}</td>}<td>{amount(line.official_fee)}</td><td>{amount(line.attorney_fee)}</td>{showDiscount && <td>{amount(-discount)}</td>}{showVat && <td>{amount(line.vat)}</td>}<td>{amount(total)}</td></tr>;
      }))}
    </tbody></table></section>
    <div className="quotation-ending"><section className="quotation-totals"><div><span>Sub Total</span><strong>{symbol} {amount(Number(invoice.grand_total) - Number(invoice.total_vat))}</strong></div>{showVat && <div><span>Total VAT</span><strong>{symbol} {amount(Number(invoice.total_vat))}</strong></div>}<div className="quotation-due"><span>Total amount due</span><strong>{symbol} {amount(Number(invoice.grand_total))}</strong></div></section>
    </div>
  </article></td></tr></tbody><tfoot aria-hidden="true"><tr><td><div className="quotation-footer-space" /></td></tr></tfoot></table></>;
}
