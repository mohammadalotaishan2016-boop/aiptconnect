'use client';
import { availableClassTypes, calculateClassPricing, quotationDisplayRows, classTypes, type ClassType, type ClassRate, type PricingRow } from '../../../backend/supabase/functions/_shared/quotation-class-pricing';
import { toPlainText } from '../../src/lib/plain-text';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import type { PrintableQuotation, QuotationRequirement } from '../../src/components/QuotationDocument';
import '../invoice/quotation-document.css';
const DataTransfer = dynamic(() => import('../../src/components/DataTransfer'));
const QuotationDocument = dynamic(() => import('../../src/components/QuotationDocument'));
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';
import TrademarkClassSelector from '../../src/components/TrademarkClassSelector';


import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from "../../src/lib/supabase/browser";
import { createQuotationQr, quotationVerificationUrl } from "../../src/lib/quotation-qr";
import "./quotation.css";
import "./client-quotation.css";

type Category = "Trademark" | "Patent" | "Design" | "Copyright" | "Others";
type TrademarkClassEntryMode = "specific" | "count";
type Country = {
  id: string;
  name: string;
  abbreviation: string;
  flag_url: string;
};
type Client = {
  id: string;
  assigned_id: number;
  company_name: string;
  email: string;
  address: string;
  country_id: string;
  status: "Active" | "Inactive";
};
type Project = {
  id: string;
  client_id: string;
  project_name: string;
  aipt_ref_no: string;
};
type Procedure = { id: string; name: string; category: Category };
type Requirement = {
  id: string;
  country_id: string;
  service_id?: string | null;
  procedure_id?: string | null;
  procedure: string | null;
  description: string;
};
type AddonFee = {
  country_id: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency?: string;
  procedure_name?: string;
};
type Fee = {
  class_pricing_rows?: PricingRow[];
  available?: boolean;
  issue?: string | null;
  currency?: string;
  id: string;
  country_id: string;
  category: Category;
  procedure_name: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
};
type Lookup = {
  class_rates: ClassRate[];
  spreadsheet_revision?: number;
  spreadsheet_updated_at?: string | null;
  role?: "administrator" | "client";
  current_client_id?: string | null;
  clients: Client[];
  services: Array<{ id: string; name: string; category: string; description: string }>;
  projects: Project[];
  countries: Country[];
  procedures: Procedure[];
  requirements: Requirement[];
  fees: Fee[];
  claiming_priority_fees: AddonFee[];
  state_fees: AddonFee[];
  aripo_country_ids: string[];
  vat_rates: Array<{ country_id: string; vat: number }>;
};
type QuoteItem = {
  country_id: string;
  category: Category;
  procedure_name: string;
  quantity: number;
  class_numbers?: number[];
  class_type?: ClassType | "Single" | "Multi" | null;
  class_pricing_rows?: PricingRow[];
  class_count?: number;
  additional_fee_per_class?: number;
  requirement_ids: string[];
  official_fee: number;
  attorney_fee: number;
  other_fee: number;
  vat_rate: number;
  claiming_priority?: boolean;
  claiming_priority_fee?: number;
  state_country_ids?: string[];
  state_fee_total?: number;
};
type Quotation = {
  id: string;
  reference_no: string;
  invoice_verification_token?: string;
  status: string;
  vat_rate: number;
  vatable: boolean;
  currency: string;
  client_matter_ref?: string;
  invoice_date: string;
  subject: string;
  discount: number;
  total_official_fee: number;
  total_attorney_fee: number;
  total_other_fee: number;
  total_vat: number;
  grand_total: number;
  created_at: string;
  client?: Client;
  project?: Project;
  primary_country?: Country;
  quotation_items: QuoteItem[];
};
type ListResponse = { data: Quotation[]; total: number };

const categories: Category[] = [
  "Trademark",
  "Patent",
  "Design",
  "Copyright",
  "Others",
];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
const dateText = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
const validFlagUrl = (value?: string | null) =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
const emptyLookup: Lookup = {
  class_rates: [],
  clients: [],
  services: [],
  projects: [],
  countries: [],
  procedures: [],
  requirements: [],
  fees: [],
  claiming_priority_fees: [],
  state_fees: [],
  aripo_country_ids: [],
  vat_rates: [],
};
const blankItem = (category: Category = "Trademark"): QuoteItem => ({
  country_id: "",
  category,
  procedure_name: "",
  quantity: 1,
  class_numbers: [],
  requirement_ids: [],
  official_fee: 0,
  attorney_fee: 0,
  other_fee: 0,
  vat_rate: 0,
  claiming_priority: false,
  claiming_priority_fee: 0,
  state_country_ids: [],
  state_fee_total: 0,
});

function generateInvoiceSubject({
  item,
  countryName,
}: {
  item: QuoteItem;
  countryName: string;
}) {
  const country = countryName || "[country]";
  const procedure = item.procedure_name || "[procedure]";
  return `${procedure} in ${country}.`;
}

export default function QuotationsPage() {
  const clientView = usePathname() === "/client-dashboard/quotations";
  const [lookup, setLookup] = useState<Lookup>(emptyLookup);
  const [rows, setRows] = useState<Quotation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize,setPageSize]=useState(5);
  const [ascending,setAscending]=useState(false);
  const [quoteSort, setQuoteSort] = useState('created_at');
  const [quoteCountry, setQuoteCountry] = useState('');
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState<"form" | "view" | "delete" | null>(null);
  const [feeModal, setFeeModal] = useState(false);
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [clientId, setClientId] = useState("");
    const [projectId, setProjectId] = useState("");
  const [clientMatterRef, setClientMatterRef] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [subject, setSubject] = useState("");
  const [vatable, setVatable] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [category, setCategory] = useState<Category>("Trademark");
  const [serviceSelectionConfirmed, setServiceSelectionConfirmed] = useState(false);
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [procedureNames, setProcedureNames] = useState<string[]>([]);
  const [requirementIds, setRequirementIds] = useState<string[]>([]);
  const [selectedClassNumbers, setSelectedClassNumbers] = useState<number[]>([]);
  const [classCount, setClassCount] = useState(1);
  const [classEntryMode, setClassEntryMode] = useState<TrademarkClassEntryMode>("count");
  const [classType, setClassType] = useState<ClassType | "">("");
  const [cart, setCart] = useState<QuoteItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdReference, setCreatedReference] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [lookupError, setLookupError] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const lookupRequest = useRef<Promise<Lookup> | null>(null);
  const listRequest = useRef(0);
  const procedureDropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !procedureDropdown.current?.contains(event.target)) procedureDropdown.current?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") procedureDropdown.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  const [saving, setSaving] = useState(false);
  const [verificationQr, setVerificationQr] = useState("");

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error("Supabase is not configured.");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw Error("Please sign in to manage quotations.");
    const response = await fetchSupabaseFunction(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const body =
      response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body?.error || "Quotation request failed.");
    return body as T;
  }, []);

  // Catalog data is independent of list filters and is fetched once per mount.
  const loadLookup = useCallback(async () => {
    setLookupLoading(true);
    try {
      if (!lookupRequest.current) lookupRequest.current = api<Lookup>("quotations?lookup=true");
      const data = await lookupRequest.current;
      setLookup({ ...emptyLookup, ...data });
      if (data.role === "client" && data.current_client_id) setClientId(data.current_client_id);
      setLookupError("");
    } catch (cause) {
      lookupRequest.current = null;
      setLookupError(cause instanceof Error ? cause.message : "Unable to load fees.");
    } finally { setLookupLoading(false); }
  }, [api]);
  useEffect(() => { void loadLookup(); }, [loadLookup]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), direction: ascending ? "asc" : "desc", sort: quoteSort, country_id: quoteCountry });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status) params.set("status", status);
      const list = await api<ListResponse>(`quotations?${params}`, { signal });
      if (signal?.aborted || request !== listRequest.current) return;
      setRows(list?.data ?? []);
      setTotal(list?.total ?? 0);
      setError("");
    } catch (cause) {
      if (!signal?.aborted && request === listRequest.current) setError(cause instanceof Error ? cause.message : "Unable to load quotations.");
    } finally { if (!signal?.aborted && request === listRequest.current) setLoading(false); }
  }, [api, page, debouncedSearch, status, pageSize, ascending, quoteSort, quoteCountry]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!selected?.invoice_verification_token || modal !== "form") {
      setVerificationQr("");
      return;
    }
    let active = true;
    setVerificationQr("");
    void Promise.resolve().then(() => createQuotationQr(quotationVerificationUrl(selected.invoice_verification_token!)))
      .then(value => { if (active) setVerificationQr(value); })
      .catch(() => { if (active) setVerificationQr(""); });
    return () => { active = false; };
  }, [modal, selected]);

  const exportQuotes = async () => {
    const result: Quotation[] = [];
    for (let next = 1; ; next++) {
      const params = new URLSearchParams({ page: String(next), page_size: '100', search, status, direction: ascending ? 'asc' : 'desc', sort: quoteSort, country_id: quoteCountry });
      const response = await api<ListResponse>('quotations?' + params);
      result.push(...response.data);
      if (!response.data.length || result.length >= response.total) break;
    }
    return result.map((quote) => ({ reference: quote.reference_no, client: quote.client?.company_name, invoice_date: quote.invoice_date, status: quote.status, currency: quote.currency, total: quote.grand_total, subject: toPlainText(quote.subject) }));
  };
  const client = lookup.clients.find((item) => item.id === clientId);
  const isClientRole = clientView || lookup.role === "client";
  const projects = lookup.projects.filter(
    (item) => item.client_id === clientId,
  );
  const serviceNames = lookup.services.map((service) => service.name.trim().toLowerCase());
  const availableCategories = categories.filter((item) =>
    serviceNames.includes(item.toLowerCase()),
  );
  const serviceOptions = lookup.services
    .filter((service) => availableCategories.includes(service.name as Category))
    .map((service) => ({ id: service.id, name: service.name }));
  const selectedService = serviceOptions.find((service) => service.name === category);
  // Procedure availability follows the service catalog, independently of country rates.
  const availableProcedures = lookup.procedures.filter(
    (item) => item.category === category,
  );
  const effectiveClassCount = classCount;
  const changeClassEntryMode = (mode: TrademarkClassEntryMode) => {
    if (mode === classEntryMode) return;
    if (mode === "count") setSelectedClassNumbers([]);
    setClassEntryMode(mode);
  };
  const availableRequirements = lookup.requirements.filter(
    (item) =>
      Boolean(selectedService?.id) &&
      countryIds.length > 0 &&
      procedureNames.length > 0 &&
      item.service_id === selectedService?.id &&
      countryIds.includes(item.country_id) &&
      Boolean(item.procedure_id) &&
      procedureNames.some((procedureName) =>
        availableProcedures.some((procedure) => procedure.name === procedureName && procedure.id === item.procedure_id),
      ),
  );
  const selectedProceduresHaveWorkbookFees = countryIds.length > 0 && procedureNames.length > 0 &&
    countryIds.every((countryId) => procedureNames.every((procedureName) => {
      const matches = lookup.fees.filter((fee) =>
        fee.country_id === countryId && fee.category === category && fee.procedure_name === procedureName,
      );
      return matches.length === 1 && matches[0].available !== false && matches[0].currency === "USD" &&
        [matches[0].official_fee, matches[0].attorney_fee, matches[0].total_fee].every((value) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0,
        );
    }));
  const classTypeSelectionReady = serviceSelectionConfirmed && category === "Trademark" && countryIds.length > 0 && procedureNames.length > 0;
  const classTypeOptions = classTypeSelectionReady
    ? availableClassTypes(
      countryIds,
      lookup.class_rates ?? [],
      countryIds.filter((countryId) => procedureNames.every((procedureName) =>
        lookup.fees.some((fee) => fee.country_id === countryId && fee.category === "Trademark" &&
          fee.procedure_name === procedureName && fee.available !== false && fee.currency === "USD"),
      )),
      effectiveClassCount,
    )
    : [];
  useEffect(() => {
    if (classType && !classTypeOptions.includes(classType)) setClassType('');
  }, [countryIds, category, lookup, procedureNames, effectiveClassCount, serviceSelectionConfirmed, classType]);
  const validServiceSelection = serviceSelectionConfirmed && serviceOptions.some((service) => service.name === category);
  const validCountrySelection = countryIds.length > 0 && countryIds.every((id) => lookup.countries.some((country) => country.id === id));
  const validProcedureSelection = procedureNames.length > 0 && procedureNames.every((name) => availableProcedures.some((procedure) => procedure.name === name));
  const validClassSelection = category !== "Trademark" || (
    Boolean(classType) && classTypeOptions.includes(classType as ClassType) &&
    Number.isInteger(effectiveClassCount) && effectiveClassCount >= 1 && effectiveClassCount <= 45 &&
    (classEntryMode === "specific"
      ? selectedClassNumbers.length === effectiveClassCount
      : selectedClassNumbers.length === 0)
  );
  const selectionReady = !lookupLoading && Boolean(lookup.spreadsheet_revision) &&
    validServiceSelection && validCountrySelection && validProcedureSelection && validClassSelection;
  const selectionFees = selectionReady ? countryIds.flatMap((countryId) => procedureNames.map((procedureName) => {
    const matches = lookup.fees.filter((fee) => fee.country_id === countryId && fee.category === category && fee.procedure_name === procedureName);
    const fee = matches.length === 1 ? matches[0] : null;
    if (!fee) return { countryId, procedureName, fee: null, issue: matches.length > 1 ? 'Multiple matching procedure rates; resolve the fee data before quoting.' : 'No saved spreadsheet fee is available for this combination.' };
    try {
      if (category === 'Trademark') {
        if (!classType || !classTypeOptions.includes(classType)) throw Error('Select a type of class available for the selected countries.');
        if (classEntryMode === "specific" && selectedClassNumbers.length !== effectiveClassCount) throw Error('Select one class number for each class being priced.');
        if (classEntryMode === "count" && selectedClassNumbers.length) throw Error('Class numbers are not used when entering only a class count.');
        const pricing = calculateClassPricing(fee, countryId, classType, effectiveClassCount, lookup.class_rates ?? []);
        return { countryId, procedureName, fee: { ...fee, ...pricing, class_pricing_rows: pricing.rows }, issue: '' };
      }
      if (fee.available === false || fee.currency !== 'USD' || ![fee.official_fee, fee.attorney_fee, fee.total_fee].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw Error(fee.issue || 'No complete saved spreadsheet fee is available for this combination.');
      return { countryId, procedureName, fee, issue: '' };
    } catch (cause) {
      return { countryId, procedureName, fee: null, issue: cause instanceof Error ? cause.message : 'Unable to calculate class fees.' };
    }
  })) : [];
  const generatedFees = selectionFees.map((item) => item.fee).filter((fee): fee is NonNullable<typeof fee> => Boolean(fee));
  const allExactFeesFound = selectionReady && selectionFees.length > 0 && selectionFees.every((item) => item.fee);
  useEffect(() => {
    setRequirementIds((current) => {
      const valid = current.filter((id) => availableRequirements.some((item) => item.id === id));
      return valid.length === current.length ? current : valid;
    });
  }, [category, countryIds, procedureNames, lookup]);
  const roundFee = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
  const withSnapshot = (fee: Fee, quantity = 1): QuoteItem => ({
    country_id: fee.country_id,
    category,
    procedure_name: fee.procedure_name,
    quantity,
    class_numbers: category === "Trademark" ? selectedClassNumbers : [],
    class_type: category === "Trademark" ? classType || null : null,
    class_pricing_rows: fee.class_pricing_rows ?? [],
    class_count: category === "Trademark" ? effectiveClassCount : 0,
    additional_fee_per_class: 0,
    requirement_ids: (clientView ? availableRequirements.map(requirement => requirement.id) : requirementIds).filter((id) =>
      availableRequirements.some((item) => item.id === id && item.country_id === fee.country_id && availableProcedures.some((procedure) => procedure.id === item.procedure_id && procedure.name === fee.procedure_name)),
    ),
    official_fee: roundFee(fee.official_fee * quantity),
    attorney_fee: roundFee(fee.attorney_fee * quantity),
    other_fee: roundFee(roundFee(fee.total_fee) * quantity - roundFee(fee.official_fee * quantity) - roundFee(fee.attorney_fee * quantity)),
    vat_rate: lookup.vat_rates.find((rate) => rate.country_id === fee.country_id)?.vat ?? 0,
    claiming_priority: false,
    claiming_priority_fee: 0,
    state_country_ids: [],
    state_fee_total: 0,
  });
  const previewItems = cart;
  const officialTotal = previewItems.reduce(
    (sum, item) => sum + item.official_fee,
    0,
  );
  const attorneyTotal = previewItems.reduce(
    (sum, item) => sum + item.attorney_fee,
    0,
  );
  const otherTotal = previewItems.reduce(
    (sum, item) =>
      sum + item.other_fee + (item.claiming_priority_fee ?? 0) + (item.state_fee_total ?? 0),
    0,
  );
  const vatTotal = vatable
    ? previewItems.reduce((sum, item) => sum + (item.attorney_fee * item.vat_rate) / 100, 0)
    : 0;
  const grandTotal = Math.max(
    0,
    officialTotal + attorneyTotal + otherTotal + vatTotal - discount,
  );
  const countrySummary: Array<{
    country: string;
    flag: string;
    official: number;
    attorney: number;
    vat: number;
    discount: number;
    total: number;
  }> = Object.values(
    cart.reduce((accumulator, item) => {
      const key = item.country_id;
      const country = lookup.countries.find((countryItem) => countryItem.id === key);
      if (!accumulator[key]) {
        accumulator[key] = {
          country: country?.name ?? "-",
          flag: country?.flag_url ?? "",
          official: 0,
          attorney: 0,
          vat: 0,
          discount: 0,
          total: 0,
        };
      }
      const row = accumulator[key];
      row.official += item.official_fee;
      row.attorney += item.attorney_fee;
      row.vat += vatable ? (item.attorney_fee * item.vat_rate) / 100 : 0;
      row.total += item.official_fee + item.attorney_fee + item.other_fee + (item.claiming_priority_fee ?? 0) + (item.state_fee_total ?? 0) + (vatable ? (item.attorney_fee * item.vat_rate) / 100 : 0) - (row.discount || 0);
      return accumulator;
    }, {} as Record<string, {
      country: string;
      flag: string;
      official: number;
      attorney: number;
      vat: number;
      discount: number;
      total: number;
    }>),
  ) as Array<{
    country: string;
    flag: string;
    official: number;
    attorney: number;
    vat: number;
    discount: number;
    total: number;
  }>;

  const resetForm = () => {
    setClientId(isClientRole ? lookup.current_client_id ?? "" : "");
    setProjectId("");
    setClientMatterRef("");
    setInvoiceDate(today());
    setSubject("");
    setVatable(true);
    setDiscount(0);
    setCategory("Trademark");
    setServiceSelectionConfirmed(false);
    setCountryIds([]);
    setProcedureNames([]);
    setRequirementIds([]);
    setSelectedClassNumbers([]);
    setClassCount(1);
    setClassEntryMode("count");
    setClassType("");
    setCart([]);
  };
  const openNew = () => {
    setCreatedReference(null);
    setNotice("");
    setVerificationQr("");
    setSelected(null);
    resetForm();
    setError("");
    setModal("form");
  };
  const openEdit = (quote: Quotation) => {
    if (isClientRole && quote.status !== "Pending Approval") return;
    setSelected(quote);
    setClientId(quote.client?.id ?? "");
      setProjectId(quote.project?.id ?? "");
    setClientMatterRef(quote.client_matter_ref ?? "");
    setInvoiceDate(quote.invoice_date);
    setSubject(quote.subject);
    setVatable(quote.vatable);
    setDiscount(quote.discount);
    setCart(quote.quotation_items ?? []);
    setServiceSelectionConfirmed(false);
    setSelectedClassNumbers([]);
    setClassCount(1);
    setClassEntryMode("count");
    setClassType("");
    setCountryIds([]);
    setProcedureNames([]);
    setError("");
    setModal("form");
  };
  const validateFeeSelection = () => {
    if (!serviceSelectionConfirmed || !serviceOptions.some((service) => service.name === category)) {
      setError("Select a valid service from the Services page data.");
      return false;
    }
    if (!countryIds.length || !procedureNames.length) {
      setError(
        "Select a service, at least one country, and at least one procedure.",
      );
      return false;
    }
    if (!lookup.spreadsheet_revision) {
      setError("Saved spreadsheet fees are unavailable. Retry loading the workbook before continuing.");
      return false;
    }
    if (category === "Trademark" && (!classType || !classTypeOptions.includes(classType))) {
      setError("Select a type of class available for the selected countries.");
      return false;
    }
    if (category === "Trademark" && (!Number.isInteger(effectiveClassCount) || effectiveClassCount < 1 || effectiveClassCount > 45)) {
      setError("Trademark class count must be a whole number from 1 to 45.");
      return false;
    }
    if (category === "Trademark" && classEntryMode === "specific" && selectedClassNumbers.length !== effectiveClassCount) {
      setError(`Select exactly ${effectiveClassCount} class ${effectiveClassCount === 1 ? "number" : "numbers"} from 1 to 45.`);
      return false;
    }
    if (category === "Trademark" && selectedClassNumbers.some((classNumber) =>
      !Number.isInteger(classNumber) || classNumber < 1 || classNumber > 45,
    )) {
      setError("Trademark classes must be whole numbers from 1 to 45.");
      return false;
    }
    if (category === "Trademark" && classEntryMode === "count" && selectedClassNumbers.length) {
      setError("Clear individual class numbers or choose the total class count option.");
      return false;
    }
    if (countryIds.some((id) => !lookup.countries.some((country) => country.id === id))) {
      setError("One or more selected countries are no longer available.");
      return false;
    }
    if (procedureNames.some((name) => !availableProcedures.some((procedure) => procedure.name === name))) {
      setError("One or more selected procedures do not belong to the selected service.");
      return false;
    }
    if (requirementIds.some((id) => !availableRequirements.some((requirement) => requirement.id === id))) {
      setError("One or more selected requirements do not match the selected fee filters.");
      return false;
    }
    if (!allExactFeesFound) {
      setError(
        "A workbook fee is not configured for one or more selected country and procedure combinations. Choose procedures with configured fees before adding to the cart.",
      );
      return false;
    }
    if (!isClientRole && !clientId) {
      setError("Select a client before adding fees.");
      return false;
    }
    return true;
  };
  const generateFees = (editingIndex: number | null = null, quantity = 1) => {
    if (!validateFeeSelection()) return;
    setError("");
    addGeneratedToCart(editingIndex, quantity);
    return true;
  };
  const addGeneratedToCart = (editingIndex: number | null = null, quantity = 1) => {
    const items = generatedFees.map((fee) => withSnapshot(fee, quantity));
    setCart((current) => editingIndex === null ? [...current, ...items] : [...current.slice(0, editingIndex), ...items, ...current.slice(editingIndex + 1)]);
    if (items[0]) {
      setSubject(
        generateInvoiceSubject({
          item: items[0],
          countryName:
            lookup.countries.find((item) => item.id === items[0].country_id)
              ?.name ?? "",
        }),
      );
    }
    if (!clientView) {
      setCountryIds([]);
      setProcedureNames([]);
      setRequirementIds([]);
      setSelectedClassNumbers([]);
      setClassCount(1);
      setClassEntryMode("count");
      setClassType("");
    }
    setFeeModal(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const invalidCartItem = cart.find((item) => {
      const quantity = Number(item.quantity);
      const classTotal = item.category === "Trademark"
        ? item.class_numbers?.length || item.class_count || 0
        : 0;
      const invalidClassNumber = item.category === "Trademark" &&
        (item.class_numbers ?? []).some((classNumber) =>
          !Number.isInteger(classNumber) || classNumber < 1 || classNumber > 45,
        );
      return !item.country_id || !item.procedure_name || quantity < 1 ||
        (item.category === "Trademark" && (invalidClassNumber || classTotal > 45));
    });
    if (!clientId) {
      setError("Select a client before saving the invoice.");
      return;
    }
    if (!client || !Number.isInteger(Number(client.assigned_id)) || Number(client.assigned_id) < 1) {
      setError("The selected client has no valid Business Identifier.");
      return;
    }
    if (!invoiceDate || Number.isNaN(new Date(invoiceDate).getTime())) {
      setError("Enter a valid invoice date before saving.");
      return;
    }
    if (!cart.length) {
      setError("Add at least one fee to the cart before saving.");
      return;
    }
    if (invalidCartItem) {
      setError("Correct the quantity, country, procedure, or trademark class count in the fee cart.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api<{ id: string; reference_no: string; invoice_verification_token?: string }>(selected ? `quotations/${selected.id}` : "quotations", {
        method: selected ? "PUT" : "POST",
        body: JSON.stringify({
          spreadsheet_revision: lookup.spreadsheet_revision,
          client_id: clientId,
          project_id: projectId || null,
          client_matter_ref: clientMatterRef,
          invoice_date: invoiceDate,
          subject,
          vatable,
          discount,
          items: cart,
        }),
      });
      // Creation has committed; QR rendering must not turn success into a save error.
      setModal(null);
      if (!selected) setCreatedReference(saved.reference_no);
      setNotice(
        selected
          ? "Quotation updated."
          : "Quotation saved as Pending Approval.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save quotation.",
      );
    } finally {
      setSaving(false);
    }
  };
  const approve = async (quote: Quotation) => {
    setSaving(true);
    try {
      await api(`quotations/${quote.id}/approve`, { method: "POST" });
      setNotice("Quotation approved.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to approve quotation.",
      );
    } finally {
      setSaving(false);
    }
  };
  const cancel = async (quote: Quotation) => {
    try {
      if (saving) return;
      setSaving(true);
      await api(`quotations/${quote.id}/cancel`, { method: "POST" });
      setNotice("Quotation cancelled.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel quotation.");
    } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`quotations/${selected.id}`, { method: "DELETE" });
      setModal(null);
      setNotice("Quotation deleted.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to delete quotation.",
      );
    } finally {
      setSaving(false);
    }
  };
  const subjectText = generateInvoiceSubject({
    item: {
      ...blankItem(category),
      category,
      procedure_name: procedureNames[0] || "",
    },
    countryName: lookup.countries.find((item) => item.id === countryIds[0])?.name ?? "",
  });

  return (
    <main className={`procedure-page quotation-page${clientView ? " client-quotation-page" : ""}`}>
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Quotations</b>
          </p>
          <div className="top-profile">
            <span>MS</span>
            <b>
              Mohammad Saleh<small>Administrator</small>
            </b>
          </div>
        </header>
        {!clientView && <div className="countries-heading">
          <div>
            <h1>Quotations</h1>
            <p>Create, review, approve, and manage client quotations.</p>
          </div>
          <button className="country-add" type="button" onClick={openNew} data-action="add" title="Add Quotation"><ActionIcon name="add" /><span className="aipt-action-label">Add Quotation</span></button>
        </div>
        }
        {clientView && <section className="client-fee-selection" aria-labelledby="client-fee-title">
          <h2 id="client-fee-title"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M2 3h20l-8 9v8l-4 2V12z" /></svg>Fee Selections</h2>
          <form onSubmit={event => { event.preventDefault(); if (!validateFeeSelection()) return; setSelected(null); setCart([]); setInvoiceDate(today()); setDiscount(0); setError(""); if (generateFees()) setModal("form"); }}>
            <label className="client-service-field">Services / Project *<select aria-label="Services / Project" value={serviceSelectionConfirmed ? category : ""} disabled={lookupLoading} onChange={event => { setCategory(event.target.value as Category); setServiceSelectionConfirmed(true); setCountryIds([]); setProcedureNames([]); setRequirementIds([]); setClassType(""); setClassCount(1); setClassEntryMode("count"); setSelectedClassNumbers([]); setError(""); }}><option value="" disabled>Select Services / Project</option>{serviceOptions.map(service => <option key={service.id} value={service.name}>{service.name}</option>)}</select></label>
            <label className="client-country-field">Country *<select aria-label="Country" value={countryIds[0] ?? ""} disabled={!serviceSelectionConfirmed || lookupLoading} onChange={event => { setCountryIds(event.target.value ? [event.target.value] : []); setRequirementIds([]); setClassType(""); setSelectedClassNumbers([]); setError(""); }}><option value="">Select Country</option>{lookup.countries.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <div className="client-procedure-field"><span>Procedure * <small>(multiple allowed)</small></span><details ref={procedureDropdown}><summary>{!serviceSelectionConfirmed ? "Select service first" : procedureNames.length ? procedureNames.join(", ") : "Select Procedure"}</summary><div>{availableProcedures.map(procedure => <label key={procedure.id}><input type="checkbox" disabled={!serviceSelectionConfirmed} checked={procedureNames.includes(procedure.name)} onChange={event => { const checked = event.target.checked; setProcedureNames(current => checked ? [...current, procedure.name] : current.filter(name => name !== procedure.name)); setError(""); }} />{procedure.name}</label>)}</div></details></div>
            {category === "Trademark" && <>
              <label className="client-class-type">Type of class *<select aria-label="Type of class" disabled={!classTypeSelectionReady || lookupLoading} value={classType} onChange={event => { setClassType(event.target.value as ClassType); setError(""); }}><option value="">{!serviceSelectionConfirmed || !countryIds.length ? "Select service and country first" : !procedureNames.length ? "Select procedure first" : "Select Type of class"}</option>{classTypeOptions.map(type => <option key={type} value={type}>{type === 'Multi-class' ? 'Multi class' : type}</option>)}</select></label>
              <fieldset className="client-class-entry-method" aria-label="Class input method">
                <legend>Class input method *</legend>
                <label><input aria-label="Select class numbers individually" type="radio" name="client-class-entry-mode" value="specific" checked={classEntryMode === "specific"} disabled={!classTypeSelectionReady || lookupLoading} onChange={() => changeClassEntryMode("specific")} /><span><strong>Select individually</strong><small>Choose exact classes 1-45</small></span></label>
                <label><input aria-label="Enter total class count" type="radio" name="client-class-entry-mode" value="count" checked={classEntryMode === "count"} disabled={!classTypeSelectionReady || lookupLoading} onChange={() => changeClassEntryMode("count")} /><span><strong>Enter total count</strong><small>No class numbers required</small></span></label>
              </fieldset>
                {classEntryMode === "specific" && <label className="client-class-count">Number of classes *<select aria-label="Number of classes" value={classCount} disabled={!classTypeSelectionReady || lookupLoading} onChange={event => { const nextCount = Number(event.target.value); setClassCount(nextCount); setSelectedClassNumbers(current => current.slice(0, nextCount)); setError(""); }}>{Array.from({ length: 45 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} {count === 1 ? "class" : "classes"}</option>)}</select></label>}
                {classEntryMode === "count" && <label className="client-class-count">Total number of classes *<input aria-label="Total number of classes" type="number" min="1" max="45" step="1" value={classCount} disabled={!classTypeSelectionReady || lookupLoading} onChange={event => { setClassCount(Number(event.target.value)); setError(""); }} /></label>}
            </>}
            {category === "Trademark" && classTypeSelectionReady && classEntryMode === "specific" && <TrademarkClassSelector
              required
              selected={selectedClassNumbers}
              onChange={setSelectedClassNumbers}
              classType={classType}
              classCount={effectiveClassCount}
            />}
            <button type="submit" disabled={lookupLoading || saving || !lookup.current_client_id}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></svg>Review Quotation</button>
          </form>
          {lookupError && <p role="alert">{lookupError} <button type="button" onClick={() => void loadLookup()}>Retry fees</button></p>}
        </section>}
        {notice && (
          <div className="country-toast">
            {notice}
            <button type="button" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {error && !modal && <p className="country-page-error">{error}</p>}
        <section className="country-table-card">
          <div className="quotation-toolbar">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search invoice, client, country, procedure..."
            />
            <div className="quotation-status-tabs" role="tablist" aria-label="Quotation status">
              {[["", "All"], ["Pending Approval", "Pending"], ["Approved", "Approved"], ["Cancelled", "Cancelled"], ["Rejected", "Rejected"]].map(([value, label]) => (
                <button key={value || "all"} type="button" role="tab" aria-selected={status === value} className={`${status === value ? "is-active " : ""}${value ? `is-${value.toLowerCase().replace(/\s+/g, "-")}` : "is-all"}`} onClick={() => { setStatus(value); setPage(1); }}>
                  <i aria-hidden="true" />{label}
                </button>
              ))}
            </div>
            <select aria-label="Sort quotations" value={quoteSort} onChange={(event) => { setQuoteSort(event.target.value); setPage(1); }}><option value="created_at">Created date</option><option value="reference_no">Invoice number</option><option value="grand_total">Total</option><option value="status">Status</option><option value="invoice_date">Invoice date</option></select>
            <select aria-label="Filter quotation country" value={quoteCountry} onChange={(event) => { setQuoteCountry(event.target.value); setPage(1); }}><option value="">All countries</option>{lookup.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select>
            <span>{total} quotations</span>
          </div>
          <div className="data-toolbar"><DataTransfer title="Quotations" getRows={exportQuotes} disabled={loading || saving} columns={[{key:'reference',label:'Invoice number'},{key:'client',label:'Client'},{key:'invoice_date',label:'Invoice date'},{key:'status',label:'Status'},{key:'currency',label:'Currency'},{key:'total',label:'Total'},{key:'subject',label:'Subject'}]} /></div>
          <div className="country-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Client</th>
                  <th>Client Matter</th>
                  <th>Country</th>
                  <th>Service</th>
                  <th>Procedure</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th><button className="aipt-sort" onClick={()=>{setQuoteSort("created_at");setAscending(!ascending);setPage(1)}}>Date {ascending?"↑":"↓"}</button></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && !rows.length ? (
                  <tr>
                    <td colSpan={10} className="country-state">
                      Loading quotations...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((quote) => (
                    <tr key={quote.id}>
                      <td>
                        <b>{quote.reference_no}</b>
                      </td>
                      <td>{quote.client?.company_name ?? "-"}</td>
                      <td>
                        {quote.client_matter_ref ||
                          quote.project?.aipt_ref_no ||
                          "-"}
                      </td>
                      <td>
                        {quote.quotation_items
                          ?.map(
                            (item) =>
                              lookup.countries.find(
                                (country) => country.id === item.country_id,
                              )?.name,
                          )
                          .filter(Boolean)
                          .join(", ") ||
                          quote.primary_country?.name ||
                          "-"}
                      </td>
                      <td>
                        {[
                          ...new Set(
                            quote.quotation_items?.map((item) => item.category),
                          ),
                        ].join(", ")}
                      </td>
                      <td>
                        {quote.quotation_items
                          ?.map((item) => item.procedure_name)
                          .join(", ")}
                      </td>
                      <td>${money(quote.grand_total)}</td>
                      <td>
                        <span
                          className={`quotation-status ${quote.status.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {quote.status === "Pending Approval" ? "Pending" : quote.status}
                        </span>
                      </td>
                      <td>{dateText(quote.invoice_date)}</td>
                      <td className="quotation-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(quote);
                            setModal("view");
                          }}
                         data-action="view" data-icon-only="true" title="View"><ActionIcon name="view" /><span className="aipt-action-label">View</span></button>
                        {(!isClientRole || quote.status === "Pending Approval") && <button
                          type="button"
                          onClick={() => openEdit(quote)}
                          disabled={["Approved", "Posted", "Cancelled"].includes(quote.status)}
                         data-action="edit" data-icon-only={isClientRole ? undefined : "true"} title="Edit quotation"><ActionIcon name="edit" /><span className="aipt-action-label">{isClientRole ? "Edit & update" : "Edit"}</span></button>}
                        {(!isClientRole || quote.status === "Pending Approval") && <button
                          type="button"
                          onClick={() => {
                            setSelected(quote);
                            setModal("delete");
                          }}
                         data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>}
                        {!isClientRole && quote.status === "Pending Approval" && (
                          <button
                            type="button"
                            onClick={() => void approve(quote)}
                            disabled={saving}
                           data-action="approve" data-icon-only="true" title="Approve"><ActionIcon name="approve" /><span className="aipt-action-label">Approve</span></button>
                        )}
                        {!['Approved', 'Posted', 'Cancelled'].includes(quote.status) && (
                          <button type="button" onClick={() => void cancel(quote)} disabled={saving} data-action="cancel" data-icon-only="true" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                        )}                        <button
                          type="button"
                          className="quotation-pdf-action"
                          title={quote.status === "Approved" ? "Open invoice PDF" : "PDF available after approval"}
                          onClick={() => window.open(`/invoice/${quote.id}`, "_blank", "noopener,noreferrer")}
                          disabled={quote.status !== "Approved"}
                         data-action="pdf" data-icon-only="true"><ActionIcon name="pdf" /><span className="aipt-action-label">PDF</span></button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="country-state">
                      No quotations available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} pageSizeOptions={[5]} />
          {clientView && <div className="client-status-legend"><b>Status Colors:</b>{["Pending", "Approved", "Rejected", "Cancelled"].map(label => <span key={label} className={label.toLowerCase()}><i aria-hidden="true" />{label}<small>(View / PDF)</small></span>)}</div>}
        </section>
        {modal === "form" && clientView && !selected && <ClientQuotationPreview invoice={{ reference_no: "Assigned on submission", invoice_date: invoiceDate, client_matter_ref: clientMatterRef, client, currency: "USD", vatable, vat_rate: 0, total_vat: vatTotal, discount, grand_total: grandTotal, quotation_items: cart.map(item => ({ ...item, country: lookup.countries.find(country => country.id === item.country_id) })) }} requirements={lookup.requirements.map(requirement => ({ ...requirement, category: lookup.services.find(service => service.id === requirement.service_id)?.name }))} saving={saving} error={error} onClose={() => setModal(null)} onSubmit={save} />}
        {modal === "form" && (!clientView || selected) && (
          <InvoiceModal
            client={client}
            clientId={clientId}
            isClientRole={isClientRole}
            setClientId={(value: string) => {
              setClientId(value);
                setProjectId("");
            }}
            projectId={projectId}
            setProjectId={setProjectId}
            clientMatterRef={clientMatterRef}
            setClientMatterRef={setClientMatterRef}
            invoiceDate={invoiceDate}
            setInvoiceDate={setInvoiceDate}
            subject={subject}
            setSubject={setSubject}
            subjectText={subjectText}
            lookup={lookup}
            projects={projects}
            category={category}
            serviceSelectionConfirmed={serviceSelectionConfirmed}
            setServiceSelectionConfirmed={setServiceSelectionConfirmed}
            selectionReady={selectionReady}
            selectedProceduresHaveWorkbookFees={selectedProceduresHaveWorkbookFees}
            setError={setError}
            setCategory={(value: Category) => {
              setCategory(value);
              setServiceSelectionConfirmed(true);
              setCountryIds([]);
              setClassType("");
              setClassCount(1);
              setClassEntryMode("count");
              setSelectedClassNumbers([]);
              setProcedureNames([]);
              setRequirementIds([]);
              setError("");
            }}
            serviceOptions={serviceOptions}
            availableCategories={availableCategories}
            countryIds={countryIds}
            setCountryIds={setCountryIds}
            procedureNames={procedureNames}
            setProcedureNames={setProcedureNames}
            availableProcedures={availableProcedures}
            requirementIds={requirementIds}
            setRequirementIds={setRequirementIds}
            selectedClassNumbers={selectedClassNumbers}
            setSelectedClassNumbers={(values: number[]) => {
              setSelectedClassNumbers(values);
            }}
            classEntryMode={classEntryMode}
            setClassEntryMode={setClassEntryMode}
            changeClassEntryMode={changeClassEntryMode}
            classType={classType}
            setClassType={setClassType}
            classTypeOptions={classTypeOptions}
            classCount={effectiveClassCount}
            setClassCount={setClassCount}
            availableRequirements={availableRequirements}
            selectionFees={selectionFees}
            allExactFeesFound={allExactFeesFound}
            loadingFees={lookupLoading}
            retryFees={() => { lookupRequest.current = null; void loadLookup(); }}
            countries={lookup.countries}
            generateFees={generateFees}
            cart={cart}
            setCart={setCart}
            vatable={vatable}
            setVatable={setVatable}
            discount={discount}
            setDiscount={setDiscount}
            totals={{
              official: officialTotal,
              attorney: attorneyTotal,
              other: otherTotal,
              vat: vatTotal,
              total: grandTotal,
            }}
            countrySummary={countrySummary}
            selected={selected}
            error={error}
            verificationQr={verificationQr}
            saving={saving}
            onClose={() => setModal(null)}
            onSubmit={save}
          />
        )}
        {createdReference !== null && (
          <div className="quotation-backdrop">
            <section className="quotation-dialog compact quotation-success" role="dialog" aria-modal="true" aria-labelledby="quotation-success-title">
              <span className="quotation-success-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.2 4.2L19 7" /></svg></span>
              <h2 id="quotation-success-title">Quotation successfully created</h2>
              <p className="quotation-success-reference">Reference: <strong>{createdReference}</strong></p>
              <p className="quotation-success-status"><span>Status</span><strong>Pending Approval</strong></p>
              <footer className="modal-actions">
                <button type="button" onClick={openNew}>Create another quotation</button>
                <button type="button" className="primary" autoFocus onClick={() => setCreatedReference(null)}>Done</button>
              </footer>
            </section>
          </div>
        )}
        {feeModal && (
          <FeeModal
            fees={generatedFees}
            countries={lookup.countries}
            onAdd={addGeneratedToCart}
            onClose={() => setFeeModal(false)}
          />
        )}
        {modal === "view" && selected && (
          <ViewModal quote={selected} onClose={() => setModal(null)} />
        )}
        {modal === "delete" && selected && (
          <div className="quotation-backdrop">
            <section className="quotation-dialog compact">
              <h2>Delete Quotation</h2>
              <p>Are you sure you want to delete this quotation?</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setModal(null)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                <button
                  className="danger"
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                 data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function SearchMulti({
  label,
  options,
  selected,
  disabled = false,
  onChange,
  getId,
  getLabel,
  compact = false,
}: {
  label: string;
  options: Array<{ id?: string; name?: string; description?: string; class_number?: number; flag_url?: string }>;
  selected: string[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
  getId: (item: { id?: string; name?: string; description?: string; class_number?: number; flag_url?: string }) => string;
  getLabel: (item: {
    id?: string;
    name?: string;
    description?: string;
    class_number?: number;
    flag_url?: string;
  }) => string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const visible = options.filter((item) =>
    getLabel(item).toLowerCase().includes(query.toLowerCase()),
  );
  const selectedItems = options.filter((item) => selected.includes(getId(item)));
  return (
    <div
      className={`search-multi${compact ? " search-multi-compact" : ""}${compact && focused ? " has-query" : ""}`}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={event => { if (event.key === "Escape") setFocused(false); }}
    >
      {label}
      <input
        value={query}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(event) => { setQuery(event.target.value); setFocused(true); }}
        placeholder={`Search ${label.toLowerCase()}`}
      />
      {selectedItems.length > 0 && (
        <div className="selected-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {selectedItems.map((item) => (
            <span key={getId(item)}>{getLabel(item)}</span>
          ))}
        </div>
      )}
      <div className="search-multi-options">
        {visible.length ? visible.map((item) => {
          const id = getId(item);
          return (
            <label key={id}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(id)}
                onChange={() => {
                  onChange(
                    selected.includes(id)
                      ? selected.filter((value: string) => value !== id)
                      : [...selected, id],
                  );
                  if (compact) { setQuery(""); setFocused(false); }
                }}
              />
              {validFlagUrl(item.flag_url) ? <img className="search-multi-flag" src={validFlagUrl(item.flag_url)} alt="" /> : null}
              {getLabel(item)}
            </label>
          );
        }) : <span className="search-multi-empty">No matching {label.toLowerCase()} found.</span>}
      </div>
    </div>
  );
}

function RequirementTable({
  countries,
  requirements,
  selected,
  onChange,
}: {
  countries: Country[];
  requirements: Requirement[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="applicable-requirements">
      <div className="requirement-header-row">
        <span className="requirement-toggle">✓</span>
        <div className="requirement-header-copy">
          <span>Requirements</span>
          <small>Auto-filtered based on selected service, country and procedure.</small>
        </div>
      </div>
      <button
        type="button"
        className="applicable-requirements-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="invoice-section-icon">⛭</span>
        <span>Applicable Requirements</span>
        <span className={`chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && (
      <div className="requirement-table-wrapper">
        <table className="requirement-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Country</th>
              <th>Procedure</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {requirements.length ? requirements.map((item) => {
              const country = countries.find((countryItem) => countryItem.id === item.country_id);
              return (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => onChange(
                        selected.includes(item.id)
                          ? selected.filter((value) => value !== item.id)
                          : [...selected, item.id],
                      )}
                    />
                  </td>
                  <td>
                    <span className="country-flag-cell">
                      {validFlagUrl(country?.flag_url) ? <img src={validFlagUrl(country?.flag_url)} alt="" /> : null}
                      {country?.name ?? "-"}
                    </span>
                  </td>
                  <td>{item.procedure ?? "-"}</td>
                  <td>{toPlainText(item.description)}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={4}>No requirements match the selected country and procedure.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function InvoiceModal(props: any) {
  const {
    client,
    clientId,
    isClientRole,
    setClientId,
    projectId,
    setProjectId,
    clientMatterRef,
    setClientMatterRef,
    invoiceDate,
    setInvoiceDate,
    subject,
    setSubject,
    subjectText,
    lookup,
    projects,
    category,
    serviceSelectionConfirmed,
    setServiceSelectionConfirmed,
    selectionReady,
    selectedProceduresHaveWorkbookFees,
    setError,
    setCategory,
    availableCategories,
    serviceOptions,
    countryIds,
    setCountryIds,
    procedureNames,
    setProcedureNames,
    availableProcedures,
    requirementIds,
    setRequirementIds,
    selectedClassNumbers,
    setSelectedClassNumbers,
    classEntryMode,
    setClassEntryMode,
    changeClassEntryMode,
    classCount,
    setClassCount,
    classType,
    setClassType,
    classTypeOptions,
    availableRequirements,
    selectionFees,
    allExactFeesFound,
    loadingFees,
    retryFees,
    countries,
    generateFees,
    cart,
    setCart,
    vatable,
    setVatable,
    discount,
    setDiscount,
    totals,
    countrySummary,
    selected,
    error,
    verificationQr,
    saving,
    onClose,
    onSubmit,
  } = props;
  const effectiveClassCount = classCount;
  const classTypeSelectionReady = serviceSelectionConfirmed && category === "Trademark" && countryIds.length > 0 && procedureNames.length > 0;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [draftQuantity, setDraftQuantity] = useState("1");
  const validDraft = Number.isInteger(Number(draftQuantity)) && Number(draftQuantity) >= 1 && Number(draftQuantity) <= 1000;
  const previewMultiplier = editingRow === null ? 1 : Number(draftQuantity);
  const showPreviewClassNumbers = category === "Trademark" && classEntryMode === "specific";
  const showCartClassNumbers = cart.some((item: QuoteItem) => item.category === "Trademark" && (item.class_numbers?.length ?? 0) > 0);
  const previewFeeColumnSpan = showPreviewClassNumbers ? 6 : 5;
  const previewRemainingColumnSpan = showPreviewClassNumbers ? 7 : 6;
  const cartBlocker = loadingFees ? "Loading workbook fees..."
    : !lookup.spreadsheet_revision ? "Saved spreadsheet fees are unavailable. Retry loading the workbook or contact your administrator."
    : !clientId ? "Select a client before adding fees."
    : !serviceSelectionConfirmed ? "Select a service before adding fees."
    : !serviceOptions.some((service: { name: string }) => service.name === category) ? "Select a valid service before adding fees."
    : !countryIds.length || !procedureNames.length ? "Select a country and procedure to add fees."
    : category === "Trademark" && (!classType || !classTypeOptions.includes(classType)) ? "Select a type of class before adding fees."
    : !allExactFeesFound ? "Resolve the unavailable rates shown above before adding fees."
    : editingRow !== null && !validDraft ? "Enter a whole-number quantity from 1 to 1,000." : "";
  const cancelEdit = () => {
    setEditingRow(null);
    setDraftQuantity("1");
    setCountryIds([]);
    setProcedureNames([]);
    setRequirementIds([]);
    setSelectedClassNumbers([]);
    setClassCount(1);
    setClassEntryMode("count");
    setClassType("");
  };
  const beginEdit = (item: QuoteItem, index: number) => {
    setEditingRow(index);
    setDraftQuantity(String(item.quantity || 1));
    setCategory(item.category);
    setCountryIds([item.country_id]);
    setProcedureNames([item.procedure_name]);
    setRequirementIds(item.requirement_ids ?? []);
    const itemClassNumbers = item.class_numbers ?? [];
    const hasExactClassSelection = item.category === "Trademark" &&
      itemClassNumbers.length > 0 &&
      itemClassNumbers.length === (item.class_count || itemClassNumbers.length);
    setClassEntryMode(hasExactClassSelection ? "specific" : "count");
    setSelectedClassNumbers(hasExactClassSelection ? itemClassNumbers : []);
    setClassCount(item.class_count || item.class_numbers?.length || 1);
    setClassType(classTypes.includes(item.class_type as ClassType) ? item.class_type : "Per mark per class");
    document.getElementById('quotation-fee-selection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const updateRow = () => {
    if (editingRow === null || !validDraft) return;
    if (generateFees(editingRow, Number(draftQuantity))) setEditingRow(null);
  };
  return (
    <div className="quotation-backdrop">
      <section className="quotation-dialog invoice-dialog">
        <header className="invoice-titlebar">
          <div className="invoice-title-icon">▤</div>
          <div>
            <h2>{selected ? (isClientRole ? "Edit Quotation" : "Edit Client Invoice") : "Create Client Invoice"}</h2>
            <p>{isClientRole ? "Update your quotation before administrator approval." : "Generate a professional invoice for your client"}</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <form onSubmit={(event) => { if (editingRow !== null) { event.preventDefault(); return; } onSubmit(event); }}>
          <div className="quotation-section">
            <div className="invoice-section-heading">
              <span className="invoice-section-icon">♙</span>
              <div><h3>Client Details</h3><p>Enter client and contact information.</p></div>
            </div>
            <div className="quotation-grid three">
              <label>
                Client *
                {isClientRole ? (
                  <input value={client?.company_name ?? "Loading company..."} readOnly required />
                ) : (
                  <select
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    required
                  >
                    <option value="">Select client</option>
                    {lookup.clients.map((item: Client) => (
                      <option key={item.id} value={item.id}>
                        {item.company_name} ({item.status})
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                  Business Identifier *
                <input
                  value={client ? `${client.assigned_id} (Client ID)` : "Assigned after save"}
                  readOnly
                    required
                />
              </label>
              <label>
                Client Address {client?.address ? "" : "(Not Specified)"}
                <input
                  value={client?.address ?? ""}
                  readOnly
                  placeholder="Address not specified"
                />
              </label>
              <label>
                Date of Invoice *
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                  required
                />
              </label>
              <label>
                Currency *
                <select value="USD" aria-readonly="true" tabIndex={-1} disabled>
                  <option value="USD">USD - US Dollar</option>
                </select>
              </label>
              <label>
                By / Attention
                <input
                  value={clientMatterRef}
                  onChange={(event) => setClientMatterRef(event.target.value)}
                  placeholder="Enter reference and attention details..."
                />
              </label>
            </div>
          </div>
          <div className="quotation-section">
            <div className="invoice-section-heading">
              <span className="invoice-section-icon">⚖</span>
              <div id="quotation-fee-selection"><h3>Fee Selection{editingRow !== null ? " — Edit cart item" : ""}</h3><p>Select Services / Project, Country, and one or more Procedures. For Trademark, select Type of class and choose individual class numbers or enter a total class count. Patent and Design do not use class numbers. Requirements are filtered automatically.</p></div>
            </div>
            {isClientRole && editingRow !== null && <div className="client-fee-edit-summary" role="status">
              <strong>Editing quotation item {editingRow + 1}</strong>
              <span><b>{category}</b> · {lookup.countries.find((country: Country) => country.id === countryIds[0])?.name ?? "Select country"} · {procedureNames.join(", ") || "Select procedure"}</span>
              {category === "Trademark" && <span>{classType || "Select type of class"} · {effectiveClassCount} {effectiveClassCount === 1 ? "class" : "classes"} · {classEntryMode === "specific" ? "class numbers selected" : "count entered"}</span>}
              <span>Change the fields below, then choose <b>Update cart item</b> to apply the new configured fees.</span>
            </div>}
            <div className="quotation-grid four">
              <div className="fee-field">
                <SearchMulti
                  label={editingRow !== null && category === "Trademark" ? "Trademark *" : `Services / Project *`}
                  options={serviceOptions}
                  selected={serviceSelectionConfirmed && category ? [category] : []}
                  onChange={(values) => {
                    const selectedService = values.at(-1);
                    if (selectedService) {
                      setCategory(selectedService as Category);
                      setServiceSelectionConfirmed(true);
                      setCountryIds([]);
                      setClassType("");
                      setClassCount(1);
                      setClassEntryMode("count");
                      setSelectedClassNumbers([]);
                      setProcedureNames([]);
                      setRequirementIds([]);
                      setError("");
                    }
                  }}
                  getId={(item) => item.name!}
                  getLabel={(item) => item.name!}
                  compact
                />

              </div>
              <SearchMulti
                label="Country *"
                options={lookup.countries}
                selected={countryIds}
                disabled={!serviceSelectionConfirmed}
                onChange={(values) => { setCountryIds(values); setRequirementIds([]); setClassType(""); setError(""); }}
                getId={(item) => item.id!}
                getLabel={(item) => item.name!}
                compact
              />



              <SearchMulti
                label="Procedure * (multiple allowed)"
                options={availableProcedures}
                selected={procedureNames}
                disabled={!serviceSelectionConfirmed}
                onChange={(values) => { setProcedureNames(values); setRequirementIds([]); setError(""); }}
                getId={(item) => item.name!}
                getLabel={(item) => item.name!}
                compact
              />


              {editingRow !== null && <label>Marks / applications
                <input className="cart-number" aria-label="Marks / applications" type="number" min="1" max="1000" step="1" value={draftQuantity} onChange={(event) => setDraftQuantity(event.target.value)} />
              </label>}
              {category === "Trademark" && <>
                <label>Class input method *
                  <select aria-label="Class input method" value={classEntryMode} onChange={(event) => changeClassEntryMode(event.target.value as TrademarkClassEntryMode)} disabled={!classTypeSelectionReady}>
                    <option value="specific">Select class numbers individually</option>
                    <option value="count">Enter total number of classes</option>
                  </select>
                </label>
                <label>Type of class *
                  <select aria-label="Type of class" value={classType} onChange={(event) => setClassType(event.target.value as ClassType)} disabled={!classTypeSelectionReady}>
                    <option value="">{!serviceSelectionConfirmed || !countryIds.length ? 'Select service and country first' : !procedureNames.length ? 'Select procedure first' : 'Select type of class'}</option>
                    {classTypeOptions.map((type: ClassType) => <option key={type} value={type}>{type === 'Multi-class' ? 'Multi class' : type}</option>)}
                  </select>
                </label>
                {classEntryMode === "specific" && <label>Number of classes *
                  <select aria-label="Number of classes" value={classCount} onChange={(event) => { const nextCount = Number(event.target.value); setClassCount(nextCount); setSelectedClassNumbers((current: number[]) => current.slice(0, nextCount)); }} disabled={!classTypeSelectionReady}>
                    {Array.from({ length: 45 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} {count === 1 ? 'class' : 'classes'}</option>)}
                  </select>
                </label>}
                {classEntryMode === "count" && <label>Total number of classes *
                  <select aria-label="Total number of classes" value={classCount} onChange={(event) => { setClassCount(Number(event.target.value)); setSelectedClassNumbers([]); }} disabled={!classTypeSelectionReady}>
                    {Array.from({ length: 45 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count} {count === 1 ? 'class' : 'classes'}</option>)}
                  </select>
                </label>}
              </>}
            </div>
            {category === "Trademark" && classTypeSelectionReady && classEntryMode === "specific" && <TrademarkClassSelector
              required
              selected={selectedClassNumbers}
              onChange={setSelectedClassNumbers}
              classType={classType}
              classCount={effectiveClassCount}
            />}
            <div className="selection-panels">
              <RequirementTable countries={countries} requirements={availableRequirements} selected={requirementIds} onChange={setRequirementIds} />
            </div>
            <div className="fee-preview" aria-live="polite">
              <p>{lookup.spreadsheet_revision ? `Saved workbook revision ${lookup.spreadsheet_revision}${lookup.spreadsheet_updated_at ? ' · ' + dateText(lookup.spreadsheet_updated_at) : ''}` : ''}</p>
              {selectionReady && category === 'Trademark' && <p>The first class uses the Trademark fee. Later classes use the selected class-type tab; classes 2 to 3 or 2 to 5 are summed in one row. Class numbers identify your selections; fees follow their order.</p>}
              {classTypeSelectionReady && !classTypeOptions.length && <p className="fee-missing">No class pricing types are configured for the selected countries and class count.</p>}
              {classType && classTypeSelectionReady && !selectedProceduresHaveWorkbookFees && <p className="fee-missing">The selected procedure does not have a valid base fee in the saved workbook. Class types are shown from the country rates, but this selection cannot be quoted until the procedure fee is available.</p>}
              {!loadingFees && !lookup.spreadsheet_revision && <p className="fee-missing">Saved workbook fees are unavailable. Retry loading the workbook.</p>}
              {!selectionReady && lookup.spreadsheet_revision && <p>Select Services / Project, Country, and one or more Procedures to display matching workbook fees. Trademark also requires Type of class and either class-number selection or a total class count.</p>}
              {selectionFees.length ? <table><thead><tr><th>Country</th><th>Procedure</th><th>Qty</th>{showPreviewClassNumbers && <th>Class numbers</th>}<th>Official (USD)</th><th>Attorney (USD)</th><th>VAT (USD)</th><th>Total (USD)</th></tr></thead><tbody>
                {selectionFees.flatMap((item: { countryId: string; procedureName: string; fee: Fee | null; issue: string }) => {
                  const key = item.countryId + item.procedureName;
                  const country = countries.find((country: Country) => country.id === item.countryId)?.name;
                  if (!item.fee) return [<tr key={key}><td>{country}</td><td>{item.procedureName}</td><td colSpan={previewFeeColumnSpan} className="fee-missing">{item.issue}</td></tr>];
                  const fee = item.fee;
                  if (!validDraft) return [<tr key={key}><td>{country}</td><td colSpan={previewRemainingColumnSpan}>Enter a valid quantity to preview fees.</td></tr>];
                  const vatRate = vatable ? lookup.vat_rates.find((rate: { country_id: string; vat: number }) => rate.country_id === item.countryId)?.vat ?? 0 : 0;
                  const official = Math.round(fee.official_fee * previewMultiplier * 100) / 100;
                  const attorney = Math.round(fee.attorney_fee * previewMultiplier * 100) / 100;
                  const other = Math.round((fee.total_fee * previewMultiplier - official - attorney) * 100) / 100;
                  const rows = quotationDisplayRows({ quantity: previewMultiplier, class_numbers: category === 'Trademark' && classEntryMode === "specific" ? selectedClassNumbers : [], class_count: classCount, class_pricing_rows: fee.class_pricing_rows, official_fee: official, attorney_fee: attorney, other_fee: other }, vatRate);
                  const detailRows = rows.map((row, index) => <tr key={key + index}><td>{index === 0 ? country : ''}</td><td>{index === 0 && <strong>{item.procedureName}</strong>}<span className="class-fee-description">{row.label || 'Procedure fee'}</span>{row.source && <small>Fees: {row.source}</small>}</td><td>{row.quantity}</td>{showPreviewClassNumbers && <td>{row.class_numbers.join(', ') || 'Not specified'}</td>}<td>{money(row.official_fee)}</td><td>{money(row.attorney_fee)}</td><td>{money(row.vat)}</td><td>{money(row.official_fee + row.attorney_fee + row.other_fee + row.vat)}</td></tr>);
                  if (category !== 'Trademark') return detailRows;
                  return [...detailRows, <tr key={key + '-subtotal'} className="class-pricing-subtotal"><td colSpan={showPreviewClassNumbers ? 4 : 3}>{item.procedureName} subtotal{classType ? ' / ' + classType : ''}</td><td>{money(official)}</td><td>{money(attorney)}</td><td>{money(rows.reduce((sum, row) => sum + row.vat, 0))}</td><td>{money(official + attorney + other + rows.reduce((sum, row) => sum + row.vat, 0))}</td></tr>];
                })}
              </tbody></table> : <p>{!serviceSelectionConfirmed ? "Select a service to begin." : !countryIds.length ? "Select a country to continue." : !procedureNames.length ? "Select one or more procedures to continue." : category === "Trademark" && !classType ? "Select a type of class to display the matching fees." : "No matching fee selection is ready to display."}</p>}
            </div>
            {selectionFees.length > 0 && <p>Amounts reflect your selections. VAT and discount are shown in the cart.</p>}
            {cartBlocker && <p id="cart-blocker" role="status">{cartBlocker}</p>}
            {!lookup.spreadsheet_revision && <button type="button" onClick={retryFees} disabled={loadingFees || saving}>{loadingFees ? "Loading workbook..." : "Retry loading workbook"}</button>}
            <button
              className="outline-action generate-fees"
              type="button"
              onClick={() => editingRow === null ? generateFees() : updateRow()}
             disabled={Boolean(cartBlocker) || saving} aria-describedby={cartBlocker ? "cart-blocker" : undefined} data-local-action="true" data-action={editingRow === null ? "add" : "update"} title={editingRow === null ? "Add to cart" : "Update cart item"}><ActionIcon name={editingRow === null ? "add" : "update"} /><span className="aipt-action-label">{editingRow === null ? "Add to cart" : "Update cart item"}</span></button>
            {editingRow !== null && <button type="button" onClick={cancelEdit}>Cancel edit</button>}
          </div>
          <div className="quotation-section">
            <div className="invoice-section-heading">
              <span className="invoice-section-icon">🛒</span>
              <div><h3>Fee Cart</h3><p>Select Edit to modify service, country, procedures and optional classes in Fee Selection. Update applies the configured fees.</p></div>
              <button className="clear-button" type="button" onClick={() => { setCart([]); cancelEdit(); }} data-action="delete" title="Clear Cart"><ActionIcon name="delete" /><span className="aipt-action-label">Clear Cart</span></button>
            </div>
            {cart.length ? (
              <div className="quotation-data-table invoice-cart-table">
                <table>
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th>Procedure</th>
                      <th>Qty</th>
                      {showCartClassNumbers && <th>Class numbers</th>}
                      <th>Official Fee (USD)</th>
                      <th>Attorney Fee (USD)</th>
                      <th>VAT</th>
                      {!isClientRole && <th>Discount (USD)</th>}
                      <th>Total (USD)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.flatMap((item: QuoteItem, index: number) => {
                      const country = lookup.countries.find((countryItem: Country) => countryItem.id === item.country_id);
                      const lines = quotationDisplayRows(item, vatable ? item.vat_rate : 0);
                      return lines.map((line, lineIndex) => {
                        const rowDiscount = index === 0 && lineIndex === 0 ? discount : 0;
                        const rowTotal = line.official_fee + line.attorney_fee + line.other_fee + line.vat - rowDiscount;
                        return <tr key={index + '-' + lineIndex} className={lineIndex === 0 ? 'class-fee-group-start' : 'class-fee-detail'}>
                          <td>{lineIndex === 0 && <span className="country-flag-cell">{validFlagUrl(country?.flag_url) ? <img src={validFlagUrl(country?.flag_url)} alt="" /> : null}{country?.name ?? '-'}</span>}</td>
                          <td>{lineIndex === 0 && <strong>{item.procedure_name}</strong>}<span className="class-fee-description">{line.label || item.class_type || 'Procedure fee'}</span>{line.source && <small>Fees: {line.source}</small>}</td>
                          <td>{line.quantity}</td>
                          {showCartClassNumbers && <td>{item.category === 'Trademark' ? line.class_numbers.join(', ') || 'Not specified' : ''}</td>}
                          <td>$ {money(line.official_fee)}</td><td>$ {money(line.attorney_fee)}</td>
                          <td>$ {money(line.vat)} <small>({vatable ? item.vat_rate : 0}%)</small></td>
                          {!isClientRole && <td>$ {money(rowDiscount)}</td>}
                          <td><strong>$ {money(rowTotal)}</strong>{line.other_fee > 0 && <small className="class-fee-description">Includes other fees: $ {money(line.other_fee)}</small>}</td>
                          {lineIndex === 0 && <td rowSpan={lines.length}><div className="cart-row-actions">{editingRow === index ? <><button type="button" className="cart-update" disabled={!validDraft} onClick={updateRow} data-action="update" data-icon-only="true" title="Update"><ActionIcon name="update" /><span className="aipt-action-label">Update</span></button><button type="button" onClick={cancelEdit} data-action="cancel" data-icon-only="true" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button></> : <button type="button" disabled={editingRow !== null} onClick={() => beginEdit(item, index)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button>}<button type="button" className="cart-remove" disabled={editingRow !== null} onClick={() => setCart(cart.filter((_: QuoteItem, itemIndex: number) => itemIndex !== index))} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></div></td>}
                        </tr>;
                      });
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={showCartClassNumbers ? 4 : 3}>Total ({cart.length} procedure{cart.length === 1 ? "" : "s"})</th>
                      <th>${money(totals.official)}</th>
                      <th>${money(totals.attorney)}</th>
                      <th>${money(totals.vat)}</th>
                      {!isClientRole && <th>${money(discount)}</th>}
                      <th>${money(totals.total)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="quotation-help">
                Generate fees and add the exact selected records to the cart.
              </p>
            )}
            {!isClientRole && (
              <div className="quotation-grid four totals">
                <label>
                  Vatable
                  <select
                    value={vatable ? "Yes" : "No"}
                    onChange={(event) => setVatable(event.target.value === "Yes")}
                  >
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                </label>
                  <span className="vat-rate-summary">VAT rates are applied automatically per country.</span>
                <label>
                  Discount
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(event) => setDiscount(Number(event.target.value))}
                  />
                </label>
                <span>
                  Total<b>${money(totals.total)}</b>
                </span>
              </div>
            )}
            {!isClientRole && (
              <div className="fee-calculation-panel">
                <div className="fee-calculation-header">
                  <span className="invoice-section-icon">ⓘ</span>
                  <div>
                    <h3>Fee Calculation</h3>
                    <p>Calculation per procedure and country.</p>
                  </div>
                </div>
                <div className="fee-calculation-body">
                  {(() => {
                    const example = cart[0];
                    if (!example) return <div className="calc-example">Add fees to the cart to see the calculation breakdown.</div>;
                    const exQty = example.quantity || 1;
                    const exClasses = example.category === "Trademark" ? example.class_numbers?.length || example.class_count || 1 : 1;
                    const exOfficial = example.official_fee / exQty;
                    const exAttorney = example.attorney_fee / exQty;
                    const otherFees = example.other_fee + (example.claiming_priority_fee ?? 0) + (example.state_fee_total ?? 0);
                    const totalFees = example.attorney_fee + example.official_fee + otherFees;
                    const exVat = vatable ? example.attorney_fee * example.vat_rate / 100 : 0;
                    const grand = totalFees + exVat - discount;
                    return (
                      <div className="calc-example">
                        <b>Calculation · {example.procedure_name}</b>
                        <div>Qty ({exQty}) &times; Attorney fee for {exClasses} class(es) ({money(exAttorney)}) = <b>{money(example.attorney_fee)}</b></div>
                        <div>Qty ({exQty}) &times; Official fee for {exClasses} class(es) ({money(exOfficial)}) = <b>{money(example.official_fee)}</b></div>
                        {otherFees > 0 && <div>Other fees and add-ons = <b>{money(otherFees)}</b></div>}
                        <div>Total Fees = <b>{money(totalFees)}</b></div>
                        <div>VAT ({vatable ? example.vat_rate : 0}%) = <b>{money(exVat)}</b></div>
                        {discount > 0 && <div>Discount = <b>{money(discount)}</b></div>}
                        <div>Row Total = <b>{money(grand)}</b></div>
                      </div>
                    );
                  })()}
                  <div className="calc-note-box">
                    <span className="invoice-section-icon">ⓘ</span>
                    <div>
                      <b>Note:</b>
                      <p>VAT is always applied to attorney fees only, not to official fees.</p>
                    </div>
                  </div>
                </div>
                <div className="country-summary-block">
                  <button
                    type="button"
                    className="selection-table-title collapsible-header"
                    onClick={() => setSummaryOpen((value) => !value)}
                  >
                    <span className="invoice-section-icon">▤</span>
                    Country Fee Summary
                    <span className={`chevron${summaryOpen ? " open" : ""}`}>⌄</span>
                  </button>
                  {summaryOpen && <table>
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Total Official</th>
                        <th>Total Attorney</th>
                        <th>Total VAT</th>
                        <th>Total Discount</th>
                        <th>Grand Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countrySummary.length ? countrySummary.map((row: {
                        country: string;
                        flag: string;
                        official: number;
                        attorney: number;
                        vat: number;
                        discount: number;
                        total: number;
                      }) => (
                        <tr key={row.country}>
                          <td><span className="country-flag-cell">{validFlagUrl(row.flag) ? <img src={validFlagUrl(row.flag)} alt="" /> : null}{row.country}</span></td>
                          <td>${money(row.official)}</td>
                          <td>${money(row.attorney)}</td>
                          <td>${money(row.vat)}</td>
                          <td>${money(row.discount)}</td>
                          <td><strong>${money(row.total)}</strong></td>
                        </tr>
                      )) : <tr><td colSpan={6}>No country fee summary available.</td></tr>}
                    </tbody>
                  </table>}
                </div>
              </div>
            )}
            <div className="quotation-verification-strip">
              <div><span className="invoice-section-icon">▦</span><div><h3>QR Code for Invoice</h3><p>A QR code will be automatically generated for this invoice / fee cart after the selections are valid.</p></div></div>
              {verificationQr ? (
                <img src={verificationQr} alt="Invoice verification QR code" />
              ) : (
                <span className="qr-ready-pill">✓ QR code will be generated when ready</span>
              )}
            </div>
          </div>
          {error && <p className="quotation-error" role="alert">{error}</p>}
          <footer className="modal-actions">
            <button type="button" onClick={onClose} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
            <button className="primary" type="submit" disabled={saving || editingRow !== null} data-action={selected ? "update" : "add"} title="Update Quotation"><ActionIcon name="update" /><span className="aipt-action-label">
              {saving ? "Saving..." : selected ? "Update Quotation" : "Save Quotation"}
            </span></button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function FeeModal({
  fees,
  countries,
  onAdd,
  onClose,
}: {
  fees: Fee[];
  countries: Country[];
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div className="quotation-backdrop">
      <section className="quotation-dialog compact fee-confirm-dialog">
        <header>
          <h2>Generated Fees</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="fee-confirm-list">
          {fees.map((fee) => (
            <div key={`${fee.country_id}-${fee.procedure_name}`}>
              <b>
                {
                  countries.find((country) => country.id === fee.country_id)
                    ?.name
                }
              </b>
              <span>
                {fee.category} · {fee.procedure_name}
              </span>
              <span>Official Fees: ${money(fee.official_fee)}</span>
              <span>Attorney Fees: ${money(fee.attorney_fee)}</span>
              <strong>Total: ${money(fee.total_fee)}</strong>
            </div>
          ))}
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
          <button className="primary" type="button" onClick={onAdd} data-action="add" title="Add to Cart"><ActionIcon name="add" /><span className="aipt-action-label">Add to Cart</span></button>
        </footer>
      </section>
    </div>
  );
}

function ViewModal({
  quote,
  onClose,
}: {
  quote: Quotation;
  onClose: () => void;
}) {
  return (
    <div className="quotation-backdrop">
      <section className="quotation-dialog compact">
        <header>
          <h2>{quote.reference_no}</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="quotation-details">
          <p>
            <b>Client</b>
            {quote.client?.company_name ?? "-"}
          </p>
          <p>
            <b>Address</b>
            {quote.client?.address ?? "-"}
          </p>
          <p>
            <b>Client Matter</b>
            {quote.client_matter_ref || "-"}
          </p>
          <p>
            <b>Invoice Date</b>
            {dateText(quote.invoice_date)}
          </p>
          <p>
            <b>Subject</b>
            {quote.subject || "-"}
          </p>
          <p>
            <b>Status</b>
            {quote.status}
          </p>
          <p>
            <b>Services</b>
            {quote.quotation_items.map((item) => item.category).join(", ")}
          </p>
          <p>
            <b>Procedures</b>
            {quote.quotation_items
              .map((item) => item.procedure_name)
              .join(", ")}
          </p>
          <p>
            <b>Official Fees</b>${money(quote.total_official_fee)}
          </p>
          <p>
            <b>Attorney Fees</b>${money(quote.total_attorney_fee)}
          </p>
          <p>
            <b>VAT</b>${money(quote.total_vat)}
          </p>
          <p>
            <b>Grand Total</b>${money(quote.grand_total)}
          </p>
        </div>
        <footer className="modal-actions">
          <button className="primary" type="button" onClick={onClose} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button>
        </footer>
      </section>
    </div>
  );
}

function ClientQuotationPreview({ invoice, requirements, saving, error, onClose, onSubmit }: { invoice: PrintableQuotation; requirements: QuotationRequirement[]; saving: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return <div className="quotation-backdrop client-quotation-backdrop"><section className="client-quotation-preview" role="dialog" aria-modal="true" aria-label="Review and save quotation">
    <button type="button" className="client-preview-close" aria-label="Close quotation preview" onClick={onClose} disabled={saving}>×</button>
    <div className="client-preview-document"><QuotationDocument invoice={invoice} requirements={requirements} qrDataUrl="" qrPlaceholder="Verification available after approval" clientPreview /></div>
    {error && <p className="country-page-error" role="alert">{error}</p>}
    <form onSubmit={onSubmit}><footer><button type="button" onClick={onClose} disabled={saving}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>Cancel</button><button data-action="add" type="submit" disabled={saving}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></svg>{saving ? "Saving..." : "Save Quotation"}</button></footer></form>
  </section></div>;
}
