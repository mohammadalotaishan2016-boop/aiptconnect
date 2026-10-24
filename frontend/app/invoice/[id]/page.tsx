'use client';
import QuotationPrintView from '../../../src/components/QuotationPrintView';
import '../quotation-document.css';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';
import '../invoice.css';

type Requirement = { id: string; country_id: string; procedure: string | null; description: string; category?: string | null };
type Item = { requirement_ids?: string[]; class_numbers?: number[]; country_id: string; category: string; procedure_name: string; quantity?: number; class_input?: string | null; class_charge?: number; official_fee: number; attorney_fee: number; other_fee: number; claiming_priority?: boolean; claiming_priority_fee?: number; state_country_ids?: string[]; state_fee_total?: number; vat_rate?: number; country?: { name: string } };
type Invoice = { valid_until?: string | null; id: string; reference_no: string; invoice_verification_token: string; invoice_date: string; subject: string; grand_total: number; total_official_fee: number; total_attorney_fee: number; total_other_fee: number; total_vat: number; discount: number; currency: string; client_matter_ref?: string; vatable: boolean; vat_rate: number; status: string; client?: { company_name: string; address: string }; quotation_items: Item[] };

export default function InvoiceDocumentPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  const [error, setError] = useState('');
  useEffect(() => { let active = true; const load = async () => { try { const supabase = getSupabaseBrowserClient(); if (!supabase) throw Error('Supabase is not configured.'); const { data: { session } } = await supabase.auth.getSession(); if (!session) throw Error('Please sign in.'); const response = await fetchSupabaseFunction(`quotations?page=1&page_size=100&status=Approved&search=${encodeURIComponent(params.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw Error(body.error || 'Unable to load invoice.'); const found = (body.data ?? []).find((item: Invoice) => item.id === params.id && item.status === 'Approved'); if (!found) throw Error('Invoice not found or not approved.'); const lookupResponse = await fetchSupabaseFunction('quotations?lookup=true', { headers: { Authorization: `Bearer ${session.access_token}` } }); const lookupBody = await lookupResponse.json().catch(() => ({})); if (!lookupResponse.ok) throw Error(lookupBody.error || 'Unable to load invoice requirements.'); if (active) { setRequirements((lookupBody.requirements ?? []).map((requirement: Requirement & { service_id?: string }) => ({ ...requirement, category: (lookupBody.services ?? []).find((service: { id: string; name: string }) => service.id === requirement.service_id)?.name ?? null }))); setInvoice(found); } } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load invoice.'); } }; if (params.id) void load(); return () => { active = false; }; }, [params.id]);
  if (error) return <main className="invoice-document-error">{error}</main>;
  if (!invoice) return <main className="invoice-document-error">Loading invoice...</main>;
  return <QuotationPrintView invoice={invoice} requirements={requirements} verificationToken={invoice.invoice_verification_token || invoice.id} />;
}
