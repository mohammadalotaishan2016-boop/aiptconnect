'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';


import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../src/lib/supabase/browser";
import { createApplicationTimelineReport } from "../../src/lib/application-timeline-report";
import InviteClientUserModal from "../../src/components/InviteClientUserModal";
import ClientDataActions from "../../src/components/ClientDataActions";
import { BulkClient, collectAllClients, deleteClientBatch } from "../../src/lib/client-bulk-delete";

type Country = {
  id: string;
  name: string;
  abbreviation: string;
  flag_url: string;
};

type FeeClassification = {
  id: string;
  description: string;
  color_indication: string;
};

type ClientStatus = "Active" | "Inactive";
type ClientType = "Corporate" | "Law Firm" | "Consultant" | "Individual";

type Client = {
  id: string;
  assigned_id: number;
  company_name: string;
  fee_classification_id: string | null;
  email: string;
  phone: string;
  client_type: ClientType;
  address: string;
  country_id: string;
  notes: string;
  status: ClientStatus;
  country: Country | null;
  fee_classification: FeeClassification | null;
};

type Service = {
  id: string;
  service: string;
  color: string;
};

type Procedure = {
  id: string;
  description: string;
  service_id: string;
  service?: Service | null;
};

type Matter = {
  id: string;
  client_id: string;
  service_id: string;
  procedure_id: string;
  country_id: string;
  matter_type: MatterTab;
  matter_date: string;
  aipt_ref_no: string;
  client_ref_no: string;
  project_name: string;
  class_number: number | null;
  filing_number: string | null;
  filing_date: string | null;
  acceptance_number: string | null;
  acceptance_date: string | null;
  opposition_date: string | null;
  register_number: string | null;
  registered_date: string | null;
  renewal_date: string | null;
  annuity_years: number | null;
  annuity_date: string | null;
  applicant: string;
  status: string;
  image_path: string | null;
  service: Service | null;
  procedure: Procedure | null;
  country: Country | null;
};

type ListResponse<T> = {
  data: T[];
  total: number;
  page: number;
  page_size?: number;
};

type ClientDraft = {
  company_name: string;
  fee_classification_id: string;
  email: string;
  phone: string;
  client_type: ClientType;
  address: string;
  country_id: string;
  notes: string;
  status: ClientStatus;
};

type MatterDraft = {
  client_id: string;
  service_id: string;
  procedure_id: string;
  country_id: string;
  matter_type: MatterTab;
  matter_date: string;
  aipt_ref_no: string;
  client_ref_no: string;
  project_name: string;
  class_number: string;
  filing_number: string;
  filing_date: string;
  acceptance_number: string;
  acceptance_date: string;
  opposition_date: string;
  register_number: string;
  registered_date: string;
  renewal_date: string;
  annuity_years: string;
  annuity_date: string;
  applicant: string;
  image_path: string | null;
};

type TimelineDocument = {
  id: string;
  document_name: string;
  document_size: number;
  document_type: string;
  created_at: string;
};

type MatterImageUpload = { image_path: string };

type TimelineEntry = {
  id: string;
  project_id: string;
  procedure_id: string;
  timeline_date: string;
  description: string;
  created_at: string;
  updated_at: string;
  procedure: Procedure | null;
  documents: TimelineDocument[];
};

type TimelineDraft = {
  procedure_id: string;
  timeline_date: string;
  description: string;
};

type MatterTab = "trademark" | "patent" | "design" | "copyright" | "other";
type ClientModalMode = "add" | "edit" | null;
type MatterModalMode = "add" | "edit" | "view" | null;

const clientTypes: ClientType[] = ["Corporate", "Law Firm", "Consultant", "Individual"];
const clientStatuses: ClientStatus[] = ["Active", "Inactive"];
const matterTabs: Array<{ id: MatterTab; label: string }> = [
  { id: "trademark", label: "Trademark" },
  { id: "patent", label: "Patent" },
  { id: "design", label: "Design" },
  { id: "copyright", label: "Copyright" },
  { id: "other", label: "Others" },
];


const emptyMatterTabTotals: Record<MatterTab, number> = { trademark: 0, patent: 0, design: 0, copyright: 0, other: 0 };
const timelineFileExtensions = new Set(["pdf", "png", "jpg", "jpeg", "doc", "docx", "xls", "xlsx"]);
const TIMELINE_MAX_FILE_SIZE = 10 * 1024 * 1024;
const TIMELINE_MAX_FILE_COUNT = 10;
const TIMELINE_MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024;

const emptyClientDraft = (): ClientDraft => ({
  company_name: "",
  fee_classification_id: "",
  email: "",
  phone: "",
  client_type: "Corporate",
  address: "",
  country_id: "",
  notes: "",
  status: "Active",
});

const emptyMatterDraft = (clientId = "", serviceId = "", matterType: MatterTab = "other"): MatterDraft => ({
  client_id: clientId,
  service_id: serviceId,
  procedure_id: "",
  country_id: "",
  matter_type: matterType,
  matter_date: new Date().toISOString().slice(0, 10),
  aipt_ref_no: "",
  client_ref_no: "",
  project_name: "",
  class_number: "",
  filing_number: "",
  filing_date: "",
  acceptance_number: "",
  acceptance_date: "",
  opposition_date: "",
  register_number: "",
  registered_date: "",
  renewal_date: "",
  annuity_years: "",
  annuity_date: "",
  applicant: "",
  image_path: null,
});

const emptyTimelineDraft = (matter: Matter): TimelineDraft => ({
  procedure_id: matter.procedure_id,
  timeline_date: new Date().toISOString().slice(0, 10),
  description: "",
});

function clientToDraft(client: Client): ClientDraft {
  return {
    company_name: client.company_name,
    fee_classification_id: client.fee_classification_id ?? "",
    email: client.email,
    phone: client.phone,
    client_type: client.client_type,
    address: client.address,
    country_id: client.country_id,
    notes: client.notes,
    status: client.status,
  };
}

function matterToDraft(matter: Matter): MatterDraft {
  return {
    client_id: matter.client_id,
    service_id: matter.service_id,
    procedure_id: matter.procedure_id,
    country_id: matter.country_id,
    matter_type: matter.matter_type,
    matter_date: matter.matter_date,
    aipt_ref_no: matter.aipt_ref_no,
    client_ref_no: matter.client_ref_no,
    project_name: matter.project_name,
    class_number: matter.class_number === null ? "" : String(matter.class_number),
    filing_number: matter.filing_number ?? "",
    filing_date: matter.filing_date ?? "",
    acceptance_number: matter.acceptance_number ?? "",
    acceptance_date: matter.acceptance_date ?? "",
    opposition_date: matter.opposition_date ?? "",
    register_number: matter.register_number ?? "",
    registered_date: matter.registered_date ?? "",
    renewal_date: matter.renewal_date ?? "",
    annuity_years: matter.annuity_years === null ? "" : String(matter.annuity_years),
    annuity_date: matter.annuity_date ?? "",
    applicant: matter.applicant,
    image_path: matter.image_path,
  };
}

function timelineToDraft(timeline: TimelineEntry): TimelineDraft {
  return {
    procedure_id: timeline.procedure_id,
    timeline_date: timeline.timeline_date,
    description: timeline.description,
  };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function matterTabForService(service: Service | null | undefined): MatterTab {
  const name = service?.service.toLowerCase() ?? "";
  if (name.includes("trademark")) return "trademark";
  if (name.includes("patent")) return "patent";
  if (name.includes("design")) return "design";
  if (name.includes("copyright")) return "copyright";
  return "other";
}

function matterTabLabel(tab: MatterTab) {
  return matterTabs.find((item) => item.id === tab)?.label ?? "Other";
}

function CountryFlag({ country, compact = false }: { country: Country | null | undefined; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!country) return <span className={`country-flag-fallback${compact ? " compact" : ""}`}>--</span>;
  if (!failed && country.flag_url) {
    return <img className={`country-flag${compact ? " compact" : ""}`} src={country.flag_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return <span className={`country-flag-fallback${compact ? " compact" : ""}`}>{country.abbreviation.slice(0, 2).toUpperCase()}</span>;
}

function MatterImage({ path }: { path: string | null }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!path || !supabase) return () => { active = false; };
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/projects/image-url?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({})) as { url?: string };
      if (active && body.url) setUrl(body.url);
    });
    return () => { active = false; };
  }, [path]);
  return url ? <img className="project-image" src={url} alt="" loading="lazy" decoding="async" /> : <span className="project-image-placeholder">-</span>;
}

export default function ClientsPage() {
  const [CLIENT_PAGE_SIZE,setClientPageSize]=useState(20);
  const [MATTER_PAGE_SIZE,setMatterPageSize]=useState(20);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPage, setClientPage] = useState(1);
  const [clientSort, setClientSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "assigned_id", direction: "asc" });
  const [clientTotal, setClientTotal] = useState(0);
  const [clientRefreshKey, setClientRefreshKey] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [classifications, setClassifications] = useState<FeeClassification[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [clientModalMode, setClientModalMode] = useState<ClientModalMode>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientDraft, setClientDraft] = useState<ClientDraft>(emptyClientDraft);
  const [clientFormError, setClientFormError] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkClients, setBulkClients] = useState<BulkClient[]>([]);
  const [bulkPreparing, setBulkPreparing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkDeleted, setBulkDeleted] = useState(0);
  const [bulkFinished, setBulkFinished] = useState(false);
  const bulkDeleteLock = useRef(false);
  const [relatedClient, setRelatedClient] = useState<Client | null>(null);
  const [relatedMatters, setRelatedMatters] = useState<Matter[]>([]);
  const [matterPage, setMatterPage] = useState(1);
  const [matterTotal, setMatterTotal] = useState(0);
  const [matterTabTotals, setMatterTabTotals] = useState<Record<MatterTab, number>>(emptyMatterTabTotals);
  const [matterRefreshKey, setMatterRefreshKey] = useState(0);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState("");
  const [matterTab, setMatterTab] = useState<MatterTab>("trademark");
  const [matterSearch, setMatterSearch] = useState("");
  const [matterModalMode, setMatterModalMode] = useState<MatterModalMode>(null);
  const [editingMatter, setEditingMatter] = useState<Matter | null>(null);
  const [matterDraft, setMatterDraft] = useState<MatterDraft>(emptyMatterDraft);
  const [matterImage, setMatterImage] = useState<File | null>(null);
  const [matterFormError, setMatterFormError] = useState("");
  const [savingMatter, setSavingMatter] = useState(false);
  const [deletingMatter, setDeletingMatter] = useState<Matter | null>(null);
  const [matterDeleteError, setMatterDeleteError] = useState("");
  const [deletingMatterPending, setDeletingMatterPending] = useState(false);
  const [timelineMatter, setTimelineMatter] = useState<Matter | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraft | null>(null);
  const [timelineFiles, setTimelineFiles] = useState<File[]>([]);
  const [editingTimeline, setEditingTimeline] = useState<TimelineEntry | null>(null);
  const [timelineFormError, setTimelineFormError] = useState("");
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [deletingTimeline, setDeletingTimeline] = useState<TimelineEntry | null>(null);
  const [deletingTimelinePending, setDeletingTimelinePending] = useState(false);
  const [deletingTimelineDocumentId, setDeletingTimelineDocumentId] = useState<string | null>(null);
  const [viewTimelineEntries, setViewTimelineEntries] = useState<TimelineEntry[]>([]);
  const [viewTimelineLoading, setViewTimelineLoading] = useState(false);
  const [viewTimelineError, setViewTimelineError] = useState("");
  const [openingTimelineDocumentId, setOpeningTimelineDocumentId] = useState<string | null>(null);
  const [generatingTimelineReport, setGeneratingTimelineReport] = useState(false);
  const [timelineReportError, setTimelineReportError] = useState("");
  const [inviteClientUserOpen, setInviteClientUserOpen] = useState(false);
  const viewTimelineRequest = useRef(0);

  const request = useCallback(async <T,>(functionName: string, path = "", options: RequestInit = {}): Promise<T> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error("Supabase is not configured for this environment.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw Error("Please sign in to manage clients.");
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> | undefined),
      },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Unable to complete the request.";
      throw Error(message);
    }
    return body as T;
  }, []);

  const requestForm = useCallback(async <T,>(functionName: string, path: string, method: "POST" | "PUT", form: FormData): Promise<T> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error("Supabase is not configured for this environment.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw Error("Please sign in to manage application timelines.");
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Unable to save the timeline entry.";
      throw Error(message);
    }
    return body as T;
  }, []);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      const clientParams = new URLSearchParams({ page: String(clientPage), page_size: String(CLIENT_PAGE_SIZE) });
      if (search.trim()) clientParams.set("search", search.trim());
      clientParams.set("sort", clientSort.field);
      clientParams.set("direction", clientSort.direction);
      const [clientResult, countryResult, classificationResult, serviceResult, procedureResult] = await Promise.all([
        request<ListResponse<Client>>("clients", `?${clientParams.toString()}`),
        request<Country[]>("countries"),
        request<FeeClassification[]>("fee-classifications"),
        request<ListResponse<Service>>("services", "?page=1&page_size=100"),
        request<ListResponse<Procedure>>("procedures", "?page=1&perPage=100"),
      ]);
      setClients(clientResult.data ?? []);
      setClientTotal(clientResult.total ?? 0);
      setCountries(countryResult ?? []);
      setClassifications(classificationResult ?? []);
      setServices(serviceResult.data ?? []);
      setProcedures(procedureResult.data ?? []);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Unable to load client data.");
    } finally {
      setLoading(false);
    }
  }, [clientPage, clientRefreshKey, clientSort, request, search, CLIENT_PAGE_SIZE]);

  const sortClients = (field: string) => {
    setClientSort((current) => current.field === field
      ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
      : { field, direction: "asc" });
    setClientPage(1);
  };

  const clientSortLabel = (field: string) => clientSort.field === field ? (clientSort.direction === "asc" ? " ascending" : " descending") : "";

  const loadRelatedMatters = useCallback(async (clientId: string, tab: MatterTab, page: number, query: string) => {
    setRelatedLoading(true);
    setRelatedError("");
    try {
      const params = new URLSearchParams({ client_id: clientId, matter_type: tab, page: String(page), page_size: String(MATTER_PAGE_SIZE) });
      if (query.trim()) params.set("search", query.trim());
      const response = await request<ListResponse<Matter>>("projects", `?${params.toString()}`);
      setRelatedMatters(response.data ?? []);
      setMatterTotal(response.total ?? 0);
      setMatterPage(response.page ?? page);
    } catch (cause) {
      setRelatedMatters([]);
      setRelatedError(cause instanceof Error ? cause.message : "Unable to load related applications.");
    } finally {
      setRelatedLoading(false);
    }
  }, [request,MATTER_PAGE_SIZE]);

  const loadMatterTabTotals = useCallback(async (clientId: string) => {
    try {
      const results = await Promise.all(matterTabs.map((tab) => request<ListResponse<Matter>>("projects", `?${new URLSearchParams({ client_id: clientId, matter_type: tab.id, page: "1", page_size: "1" }).toString()}`)));
      setMatterTabTotals(matterTabs.reduce<Record<MatterTab, number>>((totals, tab, index) => ({ ...totals, [tab.id]: results[index].total ?? 0 }), { ...emptyMatterTabTotals }));
    } catch {
      setMatterTabTotals({ ...emptyMatterTabTotals });
    }
  }, [request]);

  const loadTimelineEntries = useCallback(async (projectId: string) => {
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const entries = await request<TimelineEntry[]>("timelines", `?project_id=${encodeURIComponent(projectId)}`);
      setTimelineEntries(entries ?? []);
    } catch (cause) {
      setTimelineEntries([]);
      setTimelineError(cause instanceof Error ? cause.message : "Unable to load the application timeline.");
    } finally {
      setTimelineLoading(false);
    }
  }, [request]);

  const loadViewTimelineEntries = (projectId: string) => {
    const requestId = ++viewTimelineRequest.current;
    setViewTimelineEntries([]);
    setViewTimelineLoading(true);
    setViewTimelineError("");
    void (async () => {
      try {
        const entries = await request<TimelineEntry[]>("timelines", `?project_id=${encodeURIComponent(projectId)}`);
        if (viewTimelineRequest.current === requestId) setViewTimelineEntries(entries ?? []);
      } catch (cause) {
        if (viewTimelineRequest.current === requestId) {
          setViewTimelineError(cause instanceof Error ? cause.message : "Unable to load the application timeline.");
        }
      } finally {
        if (viewTimelineRequest.current === requestId) setViewTimelineLoading(false);
      }
    })();
  };

  useEffect(() => { void loadPageData(); }, [loadPageData]);

  useEffect(() => {
    if (!relatedClient) return;
    void loadRelatedMatters(relatedClient.id, matterTab, matterPage, matterSearch);
  }, [loadRelatedMatters, matterPage, matterRefreshKey, matterSearch, matterTab, relatedClient]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (bulkDeleteOpen) {
        if (!bulkPreparing && !bulkDeleteLock.current) setBulkDeleteOpen(false);
        return;
      }
      if (deletingTimeline) setDeletingTimeline(null);
      else if (timelineMatter && !savingTimeline) { setTimelineMatter(null); setTimelineEntries([]); setEditingTimeline(null); setTimelineFiles([]); }
      else if (matterModalMode && !generatingTimelineReport) { viewTimelineRequest.current += 1; setMatterModalMode(null); setEditingMatter(null); setViewTimelineEntries([]); setViewTimelineError(""); }
      else if (deletingMatter) setDeletingMatter(null);
      else if (deletingClient && !deleting) setDeletingClient(null);
      else if (relatedClient) setRelatedClient(null);
      else if (clientModalMode) setClientModalMode(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bulkDeleteOpen, bulkPreparing, deleting, clientModalMode, deletingClient, deletingMatter, deletingTimeline, generatingTimelineReport, matterModalMode, relatedClient, savingTimeline, timelineMatter]);

  const openClientModal = (mode: Exclude<ClientModalMode, null>, client?: Client) => {
    setClientFormError("");
    setEditingClient(client ?? null);
    setClientDraft(client ? clientToDraft(client) : emptyClientDraft());
    setClientModalMode(mode);
  };

  const closeClientModal = (force = false) => {
    if (savingClient && !force) return;
    setClientModalMode(null);
    setEditingClient(null);
    setClientFormError("");
  };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientModalMode) return;
    if (!clientDraft.country_id) {
      setClientFormError("Select the client country.");
      return;
    }
    setSavingClient(true);
    setClientFormError("");
    try {
      const payload = { ...clientDraft, fee_classification_id: clientDraft.fee_classification_id || null };
      const saved = await request<Client>("clients", clientModalMode === "edit" && editingClient ? `/${editingClient.id}` : "", {
        method: clientModalMode === "edit" ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setNotice(clientModalMode === "edit" ? "Client updated successfully." : `Client ${saved.assigned_id} created successfully.`);
      if (clientModalMode === "add") setClientPage(1);
      setClientRefreshKey((value) => value + 1);
      closeClientModal(true);
    } catch (cause) {
      setClientFormError(cause instanceof Error ? cause.message : "Unable to save this client.");
    } finally {
      setSavingClient(false);
    }
  };

  const openRelatedData = (client: Client) => {
    setRelatedClient(client);
    setMatterTab("trademark");
    setMatterPage(1);
    setMatterSearch("");
    setMatterTabTotals({ ...emptyMatterTabTotals });
    void loadMatterTabTotals(client.id);
  };

  const closeRelatedData = () => {
    if (savingMatter) return;
    setRelatedClient(null);
    setRelatedMatters([]);
    setMatterTotal(0);
    setMatterPage(1);
    setMatterTabTotals({ ...emptyMatterTabTotals });
    setRelatedError("");
    setMatterModalMode(null);
    setEditingMatter(null);
    setDeletingMatter(null);
    setMatterDeleteError("");
    setTimelineMatter(null);
    setTimelineEntries([]);
    setTimelineDraft(null);
    setTimelineFiles([]);
    setEditingTimeline(null);
    setDeletingTimeline(null);
    viewTimelineRequest.current += 1;
    setViewTimelineEntries([]);
    setViewTimelineLoading(false);
    setViewTimelineError("");
    setTimelineReportError("");
  };

  const serviceForTab = (tab: MatterTab) => services.find((service) => matterTabForService(service) === tab)?.id ?? "";

  const openMatterModal = (mode: Exclude<MatterModalMode, null>, matter?: Matter) => {
    if (!relatedClient) return;
    setMatterFormError("");
    setTimelineReportError("");
    setEditingMatter(matter ?? null);
    setMatterImage(null);
    setMatterDraft(matter ? matterToDraft(matter) : emptyMatterDraft(relatedClient.id, serviceForTab(matterTab), matterTab));
    if (mode === "view" && matter) loadViewTimelineEntries(matter.id);
    else {
      viewTimelineRequest.current += 1;
      setViewTimelineEntries([]);
      setViewTimelineLoading(false);
      setViewTimelineError("");
    }
    setMatterModalMode(mode);
  };

  const closeMatterModal = (force = false) => {
    if ((savingMatter || generatingTimelineReport) && !force) return;
    viewTimelineRequest.current += 1;
    setMatterModalMode(null);
    setEditingMatter(null);
    setMatterFormError("");
    setViewTimelineEntries([]);
    setViewTimelineLoading(false);
    setViewTimelineError("");
    setTimelineReportError("");
  };

  const saveMatter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matterModalMode || matterModalMode === "view" || !relatedClient) return;
    if (!matterDraft.service_id || !matterDraft.procedure_id || !matterDraft.country_id) {
      setMatterFormError("Select a service, procedure, and country.");
      return;
    }
    if (!matterDraft.matter_date || !matterDraft.aipt_ref_no.trim() || !matterDraft.client_ref_no.trim() || !matterDraft.project_name.trim() || !matterDraft.applicant.trim()) {
      setMatterFormError("Complete all required matter fields.");
      return;
    }
    setSavingMatter(true);
    setMatterFormError("");
    try {
      let image_path = matterDraft.image_path;
      if (matterImage) {
        const form = new FormData();
        form.append("file", matterImage);
        const uploaded = await requestForm<MatterImageUpload>("projects", "/upload-image", "POST", form);
        image_path = uploaded.image_path;
      }
      const payload = {
        ...matterDraft,
        class_number: matterDraft.matter_type === "trademark" || matterDraft.matter_type === "copyright" ? matterDraft.class_number || null : null,
        annuity_years: matterDraft.matter_type === "patent" && matterDraft.annuity_years ? Number(matterDraft.annuity_years) : null,
        annuity_date: matterDraft.matter_type === "patent" ? matterDraft.annuity_date || null : null,
        image_path,
      };
      const saved = await request<Matter>("projects", matterModalMode === "edit" && editingMatter ? `/${editingMatter.id}` : "", {
        method: matterModalMode === "edit" ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setNotice(matterModalMode === "edit" ? "Application updated successfully." : "New application added to this client.");
      setMatterPage(1);
      setMatterRefreshKey((value) => value + 1);
      void loadMatterTabTotals(relatedClient.id);
      closeMatterModal(true);
    } catch (cause) {
      setMatterFormError(cause instanceof Error ? cause.message : "Unable to save this application.");
    } finally {
      setSavingMatter(false);
    }
  };

  const deleteClient = async () => {
    if (!deletingClient) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await request<null>("clients", `/${deletingClient.id}`, { method: "DELETE" });
      setNotice("Client deleted successfully.");
      setDeletingClient(null);
      if (clients.length === 1 && clientPage > 1) setClientPage((page) => page - 1);
      else setClientRefreshKey((value) => value + 1);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Unable to delete this client.");
    } finally {
      setDeleting(false);
    }
  };

  const prepareDeleteAllClients = async () => {
    setBulkDeleteOpen(true); setBulkPreparing(true); setBulkClients([]); setBulkConfirmation(""); setBulkError(""); setBulkDeleted(0); setBulkFinished(false);
    try {
      setBulkClients(await collectAllClients((page) => request<ListResponse<Client>>("clients", `?page=${page}&page_size=100&sort=assigned_id&direction=asc`)));
    } catch (cause) { setBulkError(cause instanceof Error ? cause.message : "Unable to load all clients."); }
    finally { setBulkPreparing(false); }
  };

  const deleteAllClients = async () => {
    if (bulkDeleteLock.current || bulkPreparing || bulkFinished || !bulkClients.length || bulkConfirmation !== "DELETE ALL CLIENTS") return;
    bulkDeleteLock.current = true; setBulkDeleting(true); setBulkError(""); setNotice("");
    try {
      const result = await deleteClientBatch(bulkClients, (id) => request<null>("clients", `/${id}`, { method: "DELETE" }), setBulkDeleted);
      setBulkError(result.error);
      setNotice(`${result.deleted} of ${bulkClients.length} clients deleted.${result.error ? " Deletion stopped; review the remaining clients." : ""}`);
    } finally {
      setBulkFinished(true); setBulkDeleting(false); bulkDeleteLock.current = false;
      setClientPage(1); setClientRefreshKey((value) => value + 1);
    }
  };

  const deleteMatter = async () => {
    if (!deletingMatter || !relatedClient) return;
    setDeletingMatterPending(true);
    setMatterDeleteError("");
    try {
      await request<null>("projects", `/${deletingMatter.id}`, { method: "DELETE" });
      setNotice("Application deleted successfully.");
      setDeletingMatter(null);
      if (relatedMatters.length === 1 && matterPage > 1) setMatterPage((page) => page - 1);
      else setMatterRefreshKey((value) => value + 1);
      void loadMatterTabTotals(relatedClient.id);
    } catch (cause) {
      setMatterDeleteError(cause instanceof Error ? cause.message : "Unable to archive this application.");
    } finally {
      setDeletingMatterPending(false);
    }
  };

  const openTimeline = (matter: Matter) => {
    setTimelineMatter(matter);
    setTimelineEntries([]);
    setTimelineDraft(emptyTimelineDraft(matter));
    setTimelineFiles([]);
    setEditingTimeline(null);
    setTimelineError("");
    setTimelineFormError("");
    setTimelineReportError("");
    void loadTimelineEntries(matter.id);
  };

  const closeTimeline = (force = false) => {
    if (savingTimeline && !force) return;
    setTimelineMatter(null);
    setTimelineEntries([]);
    setTimelineDraft(null);
    setTimelineFiles([]);
    setEditingTimeline(null);
    setTimelineError("");
    setTimelineFormError("");
    setTimelineReportError("");
  };

  const addTimelineFiles = (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    const invalid = selected.find((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      return !timelineFileExtensions.has(extension) || file.size < 1 || file.size > TIMELINE_MAX_FILE_SIZE;
    });
    if (invalid) {
      setTimelineFormError("Each document must be PDF, PNG, JPG, DOC, DOCX, XLS, or XLSX and no larger than 10MB.");
      return;
    }
    const next = [...timelineFiles, ...selected];
    if (next.length > TIMELINE_MAX_FILE_COUNT) {
      setTimelineFormError(`Upload up to ${TIMELINE_MAX_FILE_COUNT} documents at a time.`);
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > TIMELINE_MAX_TOTAL_FILE_SIZE) {
      setTimelineFormError("The combined document size must not exceed 50MB.");
      return;
    }
    setTimelineFormError("");
    setTimelineFiles(next);
  };

  const saveTimeline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!timelineMatter || !timelineDraft) return;
    if (!timelineDraft.procedure_id || !timelineDraft.timeline_date || timelineDraft.description.trim().length < 3) {
      setTimelineFormError("Select a procedure and date, then enter a description of at least 3 characters.");
      return;
    }
    setSavingTimeline(true);
    setTimelineFormError("");
    try {
      const form = new FormData();
      form.append("project_id", timelineMatter.id);
      form.append("procedure_id", timelineDraft.procedure_id);
      form.append("timeline_date", timelineDraft.timeline_date);
      form.append("description", timelineDraft.description.trim());
      timelineFiles.forEach((file) => form.append("files", file));
      await requestForm<TimelineEntry>("timelines", editingTimeline ? `/${editingTimeline.id}` : "", editingTimeline ? "PUT" : "POST", form);
      setNotice(editingTimeline ? "Timeline entry updated successfully." : "Timeline entry added successfully.");
      setTimelineFiles([]);
      setEditingTimeline(null);
      setTimelineDraft(emptyTimelineDraft(timelineMatter));
      await loadTimelineEntries(timelineMatter.id);
    } catch (cause) {
      setTimelineFormError(cause instanceof Error ? cause.message : "Unable to save this timeline entry.");
    } finally {
      setSavingTimeline(false);
    }
  };

  const editTimeline = (entry: TimelineEntry) => {
    setEditingTimeline(entry);
    setTimelineDraft(timelineToDraft(entry));
    setTimelineFiles([]);
    setTimelineFormError("");
  };

  const cancelTimelineEdit = () => {
    if (!timelineMatter || savingTimeline) return;
    setEditingTimeline(null);
    setTimelineFiles([]);
    setTimelineDraft(emptyTimelineDraft(timelineMatter));
    setTimelineFormError("");
  };

  const deleteTimeline = async () => {
    if (!deletingTimeline || !timelineMatter) return;
    setDeletingTimelinePending(true);
    try {
      await request<null>("timelines", `/${deletingTimeline.id}`, { method: "DELETE" });
      setNotice("Timeline entry deleted successfully.");
      if (editingTimeline?.id === deletingTimeline.id) cancelTimelineEdit();
      setDeletingTimeline(null);
      await loadTimelineEntries(timelineMatter.id);
    } catch (cause) {
      setTimelineError(cause instanceof Error ? cause.message : "Unable to delete this timeline entry.");
    } finally {
      setDeletingTimelinePending(false);
    }
  };

  const deleteTimelineDocument = async (entry: TimelineEntry, document: TimelineDocument) => {
    if (!timelineMatter || !window.confirm(`Delete ${document.document_name}?`)) return;
    setDeletingTimelineDocumentId(document.id);
    try {
      await request<null>("timelines", `/${entry.id}/documents/${document.id}`, { method: "DELETE" });
      setNotice("Timeline document deleted successfully.");
      await loadTimelineEntries(timelineMatter.id);
    } catch (cause) {
      setTimelineError(cause instanceof Error ? cause.message : "Unable to delete this timeline document.");
    } finally {
      setDeletingTimelineDocumentId(null);
    }
  };

  const openTimelineDocument = async (entry: TimelineEntry, document: TimelineDocument, disposition: "inline" | "attachment") => {
    const documentWindow = window.open("", "_blank");
    if (documentWindow) documentWindow.opener = null;
    setOpeningTimelineDocumentId(document.id);
    try {
      const { url } = await request<{ url: string }>("timelines", `/${entry.id}/documents/${document.id}/download-url?disposition=${disposition}`);
      if (documentWindow && !documentWindow.closed) documentWindow.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      if (documentWindow && !documentWindow.closed) documentWindow.close();
      const message = cause instanceof Error ? cause.message : `Unable to prepare the document ${disposition === "inline" ? "view" : "download"}.`;
      setTimelineError(message);
      setViewTimelineError(message);
    } finally {
      setOpeningTimelineDocumentId(null);
    }
  };

  const viewTimelineDocument = (entry: TimelineEntry, document: TimelineDocument) => void openTimelineDocument(entry, document, "inline");
  const downloadTimelineDocument = (entry: TimelineEntry, document: TimelineDocument) => void openTimelineDocument(entry, document, "attachment");

  const downloadApplicationTimelineReport = async (matter: Matter, client: Client, entries: TimelineEntry[]) => {
    setGeneratingTimelineReport(true);
    setTimelineReportError("");
    try {
      const { bytes, fileName } = await createApplicationTimelineReport({
        client,
        application: matter,
        timeline: entries,
        generatedAt: new Date(),
      });
      const safeBytes = new Uint8Array(bytes);
      const url = URL.createObjectURL(new Blob([safeBytes.buffer], { type: "application/pdf" }));
      const download = document.createElement("a");
      download.href = url;
      download.download = fileName;
      document.body.appendChild(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Application timeline report downloaded successfully.");
    } catch (cause) {
      setTimelineReportError(cause instanceof Error ? cause.message : "Unable to generate the application timeline report.");
    } finally {
      setGeneratingTimelineReport(false);
    }
  };

  return (
    <main className="clients-page">
      <section className="clients-content">
        <header className="clients-topbar">
          <p>Home <i>/</i> <b>Clients</b></p>
          <div className="clients-topbar-profile"><button className="client-notification-button" type="button" aria-label="Notifications">N</button><span className="admin-avatar">MS</span><p><b>Mohammad Saleh</b><small>Administrator</small></p></div>
        </header>

        <div className="clients-heading">
          <div><h1>Clients</h1></div>
          <div className="clients-actions"><button type="button" className="danger" data-action="delete" onClick={() => void prepareDeleteAllClients()} disabled={loading || deleting || bulkPreparing || bulkDeleting}><ActionIcon name="delete" /><span className="aipt-action-label">Delete All Clients</span></button><ClientDataActions search={search} onComplete={setNotice} onError={setPageError} onRefresh={() => setClientRefreshKey((value) => value + 1)} /><button type="button" className="invite-client-user" onClick={() => setInviteClientUserOpen(true)}>Invite Client User</button><button type="button" className="client-refresh" onClick={() => void loadPageData()} disabled={loading} data-action="refresh" title="Refresh"><ActionIcon name="refresh" /><span className="aipt-action-label">Refresh</span></button><button className="add-client" type="button" onClick={() => openClientModal("add")} data-action="add" title="Add New Client"><ActionIcon name="add" /><span className="aipt-action-label">Add New Client</span></button></div>
        </div>

        {notice && <div className="client-notice" role="status">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>x</button></div>}
        {pageError && <div className="client-page-error" role="alert">{pageError}<button type="button" onClick={() => void loadPageData()}>Retry</button></div>}

        <section className="clients-table-card">
          <header>
            <div><h2>Client Table Data</h2><p>{loading ? "Loading client records..." : `${clientTotal} total client${clientTotal === 1 ? "" : "s"}`}</p></div>
            <label className="table-tools"><span aria-hidden="true">Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setClientPage(1); }} placeholder="Search clients..." /></label>
          </header>
          <div className="clients-table-scroll">
            <table className="clients-table">
              <thead><tr><th><button type="button" className="table-sort" onClick={() => sortClients("assigned_id")} aria-label={`Sort by Assigned ID${clientSortLabel("assigned_id")}`}>Assigned ID {clientSort.field === "assigned_id" ? (clientSort.direction === "asc" ? "^" : "v") : ""}</button></th><th><button type="button" className="table-sort" onClick={() => sortClients("company_name")} aria-label={`Sort by Company Name${clientSortLabel("company_name")}`}>Company Name {clientSort.field === "company_name" ? (clientSort.direction === "asc" ? "^" : "v") : ""}</button></th><th>Classification of Fees</th><th><button type="button" className="table-sort" onClick={() => sortClients("email")} aria-label={`Sort by Email${clientSortLabel("email")}`}>Email {clientSort.field === "email" ? (clientSort.direction === "asc" ? "^" : "v") : ""}</button></th><th>Phone</th><th><button type="button" className="table-sort" onClick={() => sortClients("client_type")} aria-label={`Sort by Type${clientSortLabel("client_type")}`}>Type {clientSort.field === "client_type" ? (clientSort.direction === "asc" ? "^" : "v") : ""}</button></th><th>Address</th><th>Country</th><th>Notes</th><th><button type="button" className="table-sort" onClick={() => sortClients("status")} aria-label={`Sort by Status${clientSortLabel("status")}`}>Status {clientSort.field === "status" ? (clientSort.direction === "asc" ? "^" : "v") : ""}</button></th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={11} className="client-table-state">Loading clients...</td></tr> : clients.length ? clients.map((client) => (
                  <tr key={client.id}>
                    <td className="assigned-id">{client.assigned_id}</td>
                    <td><button type="button" className="client-name-button" onClick={() => void openRelatedData(client)}><span className="client-initials">{initials(client.company_name)}</span>{client.company_name}</button></td>
                    <td>{client.fee_classification ? <span className="fee-pill" style={{ "--fee-color": client.fee_classification.color_indication } as React.CSSProperties}>{client.fee_classification.description}</span> : <span className="muted-cell">Not assigned</span>}</td>
                    <td>{client.email}</td>
                    <td>{client.phone}</td>
                    <td><span className={`client-type ${client.client_type.toLowerCase().replace(/\s+/g, "-")}`}>{client.client_type}</span></td>
                    <td className="address-cell">{client.address}</td>
                    <td><span className="country-cell"><CountryFlag country={client.country} compact />{client.country?.name ?? "-"}</span></td>
                    <td className="notes-cell">{client.notes || "-"}</td>
                    <td><StatusBadge status={client.status} /></td>
                    <td><div className="client-row-actions"><button type="button" onClick={() => void openRelatedData(client)} data-action="view" data-icon-only="true" title="View"><ActionIcon name="view" /><span className="aipt-action-label">View</span></button><button type="button" onClick={() => openClientModal("edit", client)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button type="button" className="danger" onClick={() => { setDeleteError(""); setDeletingClient(client); }} disabled={deleting} data-action="delete" aria-label={`Delete ${client.company_name}`} title="Delete Client"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></div></td>
                  </tr>
                )) : <tr><td colSpan={11} className="client-table-state">No clients match your search.</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination page={clientPage} pageSize={CLIENT_PAGE_SIZE} total={clientTotal} onPageChange={setClientPage} onPageSizeChange={setClientPageSize} loading={loading} />
        </section>
      </section>

      {inviteClientUserOpen && <InviteClientUserModal onClose={() => setInviteClientUserOpen(false)} onSent={setNotice} />}

      {clientModalMode && <ClientEditor
        mode={clientModalMode}
        client={editingClient}
        draft={clientDraft}
        countries={countries}
        classifications={classifications}
        pending={savingClient}
        error={clientFormError}
        onChange={setClientDraft}
        onClose={closeClientModal}
        onSave={saveClient}
      />}

      {bulkDeleteOpen && <Modal className="delete-client-modal"><section className="delete-client" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title" aria-describedby="bulk-delete-description" aria-busy={bulkPreparing || bulkDeleting}>
        <h2 id="bulk-delete-title">Delete All Clients</h2>
        <p id="bulk-delete-description">This deletes all clients loaded for this confirmation, across every page, regardless of the search filter. Clients added afterward are not included. This cannot be undone from this page.</p>
        <p>Clients with linked applications cannot be deleted. Deletion stops at the first error; clients already deleted remain deleted. Keep this page open until deletion finishes.</p>
        <p role="status">{bulkPreparing ? "Loading all clients..." : bulkDeleting || bulkFinished ? `${bulkDeleted} of ${bulkClients.length} clients deleted.` : `${bulkClients.length} clients will be deleted.`}</p>
        {!bulkPreparing && !bulkFinished && bulkClients.length > 0 && <label className="form-field"><span>Type DELETE ALL CLIENTS to confirm</span><input autoFocus value={bulkConfirmation} onChange={(event) => setBulkConfirmation(event.target.value)} disabled={bulkDeleting} autoComplete="off" spellCheck={false} /></label>}
        {bulkError && <p className="modal-error" role="alert">{bulkError}</p>}
        <footer className="client-modal-footer"><button type="button" className="secondary" onClick={() => setBulkDeleteOpen(false)} disabled={bulkPreparing || bulkDeleting}>{bulkFinished ? "Close" : "Cancel"}</button>{!bulkFinished && <button type="button" className="danger-primary" data-action="delete" disabled={bulkPreparing || bulkDeleting || !bulkClients.length || bulkConfirmation !== "DELETE ALL CLIENTS"} onClick={() => void deleteAllClients()}><ActionIcon name="delete" /><span className="aipt-action-label">{bulkDeleting ? "Deleting..." : "Delete All Clients"}</span></button>}</footer>
      </section></Modal>}
      {deletingClient && <DeleteClientModal client={deletingClient} pending={deleting} error={deleteError} onClose={() => { if (!deleting) setDeletingClient(null); }} onDelete={() => void deleteClient()} />}

      {relatedClient && <RelatedDataModal
        client={relatedClient}
        matters={relatedMatters}
        total={matterTotal}
        page={matterPage}
        pageSize={MATTER_PAGE_SIZE}
        onPageSizeChange={setMatterPageSize}
        tabTotals={matterTabTotals}
        activeTab={matterTab}
        search={matterSearch}
        loading={relatedLoading}
        error={relatedError}
        onTabChange={(tab) => { setMatterTab(tab); setMatterPage(1); }}
        onSearchChange={(value) => { setMatterSearch(value); setMatterPage(1); }}
        onPageChange={setMatterPage}
        onClose={closeRelatedData}
        onAdd={() => openMatterModal("add")}
        onView={(matter) => openMatterModal("view", matter)}
        onEdit={(matter) => openMatterModal("edit", matter)}
        onArchive={(matter) => { setMatterDeleteError(""); setDeletingMatter(matter); }}
        onTimeline={openTimeline}
      />}

      {matterModalMode && relatedClient && <MatterEditor
        mode={matterModalMode}
        client={relatedClient}
        draft={matterDraft}
        services={services}
        procedures={procedures}
        countries={countries}
        pending={savingMatter}
        error={matterFormError}
        timelineEntries={viewTimelineEntries}
        timelineLoading={viewTimelineLoading}
        timelineError={viewTimelineError}
        openingDocumentId={openingTimelineDocumentId}
        reportPending={generatingTimelineReport}
        reportError={timelineReportError}
        image={matterImage}
        onImageChange={setMatterImage}
        onChange={setMatterDraft}
        onClose={closeMatterModal}
        onSave={saveMatter}
        onViewDocument={viewTimelineDocument}
        onDownloadDocument={downloadTimelineDocument}
        onDownloadReport={() => { if (editingMatter) void downloadApplicationTimelineReport(editingMatter, relatedClient, viewTimelineEntries); }}
      />}

      {timelineMatter && relatedClient && timelineDraft && <TimelineModal
        matter={timelineMatter}
        client={relatedClient}
        procedures={procedures}
        entries={timelineEntries}
        loading={timelineLoading}
        error={timelineError}
        draft={timelineDraft}
        files={timelineFiles}
        editing={editingTimeline}
        pending={savingTimeline}
        formError={timelineFormError}
        deletingDocumentId={deletingTimelineDocumentId}
        reportPending={generatingTimelineReport}
        reportError={timelineReportError}
        onDraftChange={setTimelineDraft}
        onFilesAdd={addTimelineFiles}
        onFileRemove={(index) => setTimelineFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}
        onClose={closeTimeline}
        onSave={saveTimeline}
        onEdit={editTimeline}
        onCancelEdit={cancelTimelineEdit}
        onDelete={(entry) => setDeletingTimeline(entry)}
        onDeleteDocument={(entry, document) => void deleteTimelineDocument(entry, document)}
        onDownloadDocument={(entry, document) => void downloadTimelineDocument(entry, document)}
        onDownloadReport={() => void downloadApplicationTimelineReport(timelineMatter, relatedClient, timelineEntries)}
      />}

      {deletingMatter && <ArchiveMatterModal matter={deletingMatter} pending={deletingMatterPending} error={matterDeleteError} onClose={() => { if (!deletingMatterPending) setDeletingMatter(null); }} onArchive={() => void deleteMatter()} />}
      {deletingTimeline && <DeleteTimelineModal entry={deletingTimeline} pending={deletingTimelinePending} error={timelineError} onClose={() => { if (!deletingTimelinePending) setDeletingTimeline(null); }} onDelete={() => void deleteTimeline()} />}
    </main>
  );
}

function ClientEditor({ mode, client, draft, countries, classifications, pending, error, onChange, onClose, onSave }: {
  mode: Exclude<ClientModalMode, null>;
  client: Client | null;
  draft: ClientDraft;
  countries: Country[];
  classifications: FeeClassification[];
  pending: boolean;
  error: string;
  onChange: (draft: ClientDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const update = <K extends keyof ClientDraft,>(field: K, value: ClientDraft[K]) => onChange({ ...draft, [field]: value });
  return <Modal className="client-editor-modal"><form className="client-form" onSubmit={onSave}>
    <header className="client-modal-heading"><div><span className="modal-kicker">CLIENT RECORD</span><h2>{mode === "add" ? "Add New Client" : "Edit Client"}</h2><p>{mode === "add" ? "Create an accurate client profile before adding applications." : "Update this client profile and keep the related applications intact."}</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close">x</button></header>
    <section className="client-form-section"><h3>Client identity</h3><div className="client-form-grid">
      <FormField label="Assigned ID"><input value={client ? String(client.assigned_id) : "Generated automatically"} readOnly aria-readonly="true" /></FormField>
      <FormField label="Company Name" required><input autoFocus value={draft.company_name} onChange={(event) => update("company_name", event.target.value)} maxLength={255} required /></FormField>
      <FormField label="Classification of Fees"><select value={draft.fee_classification_id} onChange={(event) => update("fee_classification_id", event.target.value)}><option value="">Not assigned</option>{classifications.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}</select></FormField>
      <FormField label="Type" required><select value={draft.client_type} onChange={(event) => update("client_type", event.target.value as ClientType)}>{clientTypes.map((item) => <option key={item}>{item}</option>)}</select></FormField>
    </div></section>
    <section className="client-form-section"><h3>Contact and location</h3><div className="client-form-grid">
      <FormField label="Email" required><input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} maxLength={320} required /></FormField>
      <FormField label="Phone" required><input type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} maxLength={80} required /></FormField>
      <FormField label="Country" required><CountryPicker countries={countries} value={draft.country_id} onChange={(value) => update("country_id", value)} /></FormField>
      <FormField label="Status" required><select value={draft.status} onChange={(event) => update("status", event.target.value as ClientStatus)}>{clientStatuses.map((item) => <option key={item}>{item}</option>)}</select></FormField>
      <FormField label="Address" required className="field-span-2"><textarea value={draft.address} onChange={(event) => update("address", event.target.value)} maxLength={2000} required /></FormField>
      <FormField label="Notes" className="field-span-2"><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} maxLength={4000} placeholder="Optional client notes" /></FormField>
    </div></section>
    {error && <p className="modal-error" role="alert">{error}</p>}
    <footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={pending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="modal-primary" disabled={pending} data-action="update" title="Save Client"><ActionIcon name="update" /><span className="aipt-action-label">{pending ? "Saving..." : mode === "add" ? "Save Client" : "Update Client"}</span></button></footer>
  </form></Modal>;
}

function RelatedDataModal({ client, matters, total, page, pageSize, onPageSizeChange, tabTotals, activeTab, search, loading, error, onTabChange, onSearchChange, onPageChange, onClose, onAdd, onView, onEdit, onArchive, onTimeline }: {
  client: Client;
  matters: Matter[];
  total: number;
  page: number;
  pageSize: number;
  onPageSizeChange: (size:number)=>void;
  tabTotals: Record<MatterTab, number>;
  activeTab: MatterTab;
  search: string;
  loading: boolean;
  error: string;
  onTabChange: (tab: MatterTab) => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
  onAdd: () => void;
  onView: (matter: Matter) => void;
  onEdit: (matter: Matter) => void;
  onArchive: (matter: Matter) => void;
  onTimeline: (matter: Matter) => void;
}) {
  return <Modal className="client-related-modal"><section className="related-data">
    <header className="client-modal-heading"><div><span className="modal-kicker">CLIENT RELATED DATA</span><h2>{client.company_name}</h2><p>All applications below are filtered server-side to Client ID {client.assigned_id}.</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close">x</button></header>
    <div className="related-summary"><span className="related-avatar">{initials(client.company_name)}</span><div><b>{client.company_name}</b><small>Client #{client.assigned_id} | {client.email} | {client.phone}</small></div><span className="related-meta"><CountryFlag country={client.country} compact />{client.country?.name ?? "No country"}</span><StatusBadge status={client.status} /></div>
    <div className="related-toolbar"><div className="matter-tabs" role="tablist" aria-label="Application service types">{matterTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => onTabChange(tab.id)}>{tab.label}<small>{tabTotals[tab.id]}</small></button>)}</div><div className="related-actions"><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search applications..." /><button type="button" className="modal-primary" onClick={onAdd} data-action="add" title="Add New Matter"><ActionIcon name="add" /><span className="aipt-action-label">Add New Matter</span></button></div></div>
    {error && <p className="modal-error related-error" role="alert">{error}</p>}
    <div className="matter-table"><table><thead><tr><th>Image</th><th>Date</th><th>AIP&T Ref No.</th><th>Client Ref No.</th><th>Procedure</th><th>Project</th><th>Class</th><th>Country</th><th>Filing No. / Date</th><th>Acceptance No. / Date</th><th>Register No. / Date</th><th>Renewal Date</th><th>Applicant</th><th>Actions</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={14} className="matter-state">Loading related applications...</td></tr> : matters.length ? matters.map((matter) => <tr key={matter.id}><td><MatterImage path={matter.image_path} /></td><td>{formatDate(matter.matter_date)}</td><td>{matter.aipt_ref_no}</td><td>{matter.client_ref_no}</td><td>{matter.procedure?.description ?? "-"}</td><td><b>{matter.project_name}</b><small className="matter-service">{matter.service?.service ?? "Other"}</small></td><td>{matter.class_number ?? "-"}</td><td><span className="country-cell"><CountryFlag country={matter.country} compact />{matter.country?.name ?? "-"}</span></td><td>{matter.filing_number ?? "-"}<small>{formatDate(matter.filing_date)}</small></td><td>{matter.acceptance_number ?? "-"}<small>{formatDate(matter.acceptance_date)}</small></td><td>{matter.register_number ?? "-"}<small>{formatDate(matter.registered_date)}</small></td><td>{formatDate(matter.renewal_date)}</td><td>{matter.applicant}</td><td><div className="matter-actions"><button type="button" className="timeline-action" onClick={() => onTimeline(matter)}>Timeline</button><button type="button" onClick={() => onView(matter)} data-action="view" data-icon-only="true" title="View"><ActionIcon name="view" /><span className="aipt-action-label">View</span></button><button type="button" onClick={() => onEdit(matter)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button type="button" className="danger" onClick={() => onArchive(matter)} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></div></td></tr>) : <tr><td colSpan={14} className="matter-state">No {activeTab === "other" ? "other" : activeTab} applications found for this client.</td></tr>}
    </tbody></table></div>
    <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} loading={loading} />
  </section></Modal>;
}

function MatterEditor({ mode, client, draft, services, procedures, countries, pending, error, timelineEntries, timelineLoading, timelineError, openingDocumentId, reportPending, reportError, image, onImageChange, onChange, onClose, onSave, onViewDocument, onDownloadDocument, onDownloadReport }: {
  mode: Exclude<MatterModalMode, null>;
  client: Client;
  draft: MatterDraft;
  services: Service[];
  procedures: Procedure[];
  countries: Country[];
  pending: boolean;
  error: string;
  timelineEntries: TimelineEntry[];
  timelineLoading: boolean;
  timelineError: string;
  openingDocumentId: string | null;
  reportPending: boolean;
  reportError: string;
  image: File | null;
  onImageChange: (file: File | null) => void;
  onChange: (draft: MatterDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onViewDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
  onDownloadDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
  onDownloadReport: () => void;
}) {
  const readOnly = mode === "view";
  const requiresClass = draft.matter_type === "trademark";
  const allowsOptionalClass = draft.matter_type === "copyright";
  const isPatent = draft.matter_type === "patent";
  const servicesForMatterType = services.filter((service) => service.id === draft.service_id || matterTabForService(service) === draft.matter_type);
  const proceduresForService = procedures.filter((procedure) => procedure.service_id === draft.service_id);
  const update = <K extends keyof MatterDraft,>(field: K, value: MatterDraft[K]) => onChange({ ...draft, [field]: value });
  const updateService = (serviceId: string) => onChange({ ...draft, service_id: serviceId, procedure_id: "", class_number: requiresClass || allowsOptionalClass ? draft.class_number : "" });
  return <Modal className="matter-editor-modal" elevated><form className="matter-form" onSubmit={onSave}>
    <header className="client-modal-heading"><div><span className="modal-kicker">{mode === "view" ? "APPLICATION DETAILS" : "CLIENT APPLICATION"}</span><h2>{mode === "add" ? "Add New Matter" : mode === "edit" ? "Edit Matter" : draft.project_name || "Matter details"}</h2><p>{client.company_name} | Client ID {client.assigned_id}</p></div><button type="button" className="modal-close" onClick={onClose} disabled={pending || reportPending} aria-label="Close">x</button></header>
    <section className="matter-form-section"><h3>Application type and references</h3><div className="matter-form-grid">
      <MatterField label="Application type"><input value={matterTabLabel(draft.matter_type)} readOnly aria-readonly="true" /></MatterField>
      <MatterField label="Date" required><input type="date" value={draft.matter_date} onChange={(event) => update("matter_date", event.target.value)} disabled={readOnly} required /></MatterField>
      <MatterField label="Service" required><select value={draft.service_id} onChange={(event) => updateService(event.target.value)} disabled={readOnly} required><option value="">Select service</option>{servicesForMatterType.map((service) => <option key={service.id} value={service.id}>{service.service}</option>)}</select></MatterField>
      <MatterField label="AIP&T Ref No." required><input value={draft.aipt_ref_no} onChange={(event) => update("aipt_ref_no", event.target.value)} disabled={readOnly} required /></MatterField>
      <MatterField label="Client Ref No." required><input value={draft.client_ref_no} onChange={(event) => update("client_ref_no", event.target.value)} disabled={readOnly} required /></MatterField>
      <MatterField label="Procedure" required><ProcedurePicker procedures={proceduresForService} value={draft.procedure_id} onChange={(value) => update("procedure_id", value)} disabled={readOnly || !draft.service_id} /></MatterField>
      <MatterField label="Project" required><input value={draft.project_name} onChange={(event) => update("project_name", event.target.value)} disabled={readOnly} required /></MatterField>
      {(requiresClass || allowsOptionalClass) && <MatterField label="Class (1-50)" required={requiresClass}><select value={draft.class_number} onChange={(event) => update("class_number", event.target.value)} disabled={readOnly} required={requiresClass}><option value="">{requiresClass ? "Select class" : "Not applicable"}</option>{Array.from({ length: 50 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></MatterField>}
      <MatterField label="Country" required><CountryPicker countries={countries} value={draft.country_id} onChange={(value) => update("country_id", value)} disabled={readOnly} /></MatterField>
    </div></section>
    <section className="matter-form-section"><h3>Filing and registration</h3><div className="matter-form-grid">
      <MatterField label="Filing Number"><input value={draft.filing_number} onChange={(event) => update("filing_number", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Filing Date"><input type="date" value={draft.filing_date} onChange={(event) => update("filing_date", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Acceptance Number"><input value={draft.acceptance_number} onChange={(event) => update("acceptance_number", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Acceptance Date"><input type="date" value={draft.acceptance_date} onChange={(event) => update("acceptance_date", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Opposition Date"><input type="date" value={draft.opposition_date} onChange={(event) => update("opposition_date", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Register Number"><input value={draft.register_number} onChange={(event) => update("register_number", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Registered Date"><input type="date" value={draft.registered_date} onChange={(event) => update("registered_date", event.target.value)} disabled={readOnly} /></MatterField>
      <MatterField label="Renewal Date"><input type="date" value={draft.renewal_date} onChange={(event) => update("renewal_date", event.target.value)} disabled={readOnly} /></MatterField>
      {isPatent && <><MatterField label="Annuity Years"><input type="number" min="1" max="50" value={draft.annuity_years} onChange={(event) => update("annuity_years", event.target.value)} disabled={readOnly} /></MatterField><MatterField label="Annuity Date"><input type="date" value={draft.annuity_date} onChange={(event) => update("annuity_date", event.target.value)} disabled={readOnly} /></MatterField></>}
      <MatterField label="Applicant" required><input value={draft.applicant} onChange={(event) => update("applicant", event.target.value)} disabled={readOnly} required /></MatterField>
      <MatterField label="Application Image"><input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={(event) => onImageChange(event.target.files?.[0] ?? null)} disabled={readOnly} />{image && <small>{image.name}</small>}{draft.image_path && !image && <small>Image already uploaded</small>}</MatterField>
    </div></section>
    {readOnly && <ReadOnlyTimelineHistory
      entries={timelineEntries}
      loading={timelineLoading}
      error={timelineError}
      openingDocumentId={openingDocumentId}
      onViewDocument={onViewDocument}
      onDownloadDocument={onDownloadDocument}
    />}
    {readOnly && reportError && <p className="modal-error" role="alert">{reportError}</p>}
    {error && <p className="modal-error" role="alert">{error}</p>}
    <footer className="client-modal-footer">{readOnly && <button type="button" className="timeline-report-button" onClick={onDownloadReport} disabled={timelineLoading || reportPending} data-action="download" title="Download Timeline Report"><ActionIcon name="download" /><span className="aipt-action-label">{reportPending ? "Generating report..." : "Download Timeline Report"}</span></button>}<button type="button" className="secondary" onClick={onClose} disabled={pending || reportPending} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">{readOnly ? "Close" : "Cancel"}</span></button>{!readOnly && <button className="modal-primary" disabled={pending} data-action="update" title="Save Matter"><ActionIcon name="update" /><span className="aipt-action-label">{pending ? "Saving..." : mode === "add" ? "Save Matter" : "Update Matter"}</span></button>}</footer>
  </form></Modal>;
}

function ReadOnlyTimelineHistory({ entries, loading, error, openingDocumentId, onViewDocument, onDownloadDocument }: {
  entries: TimelineEntry[];
  loading: boolean;
  error: string;
  openingDocumentId: string | null;
  onViewDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
  onDownloadDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
}) {
  return <section className="matter-view-timeline">
    <header className="timeline-section-heading">
      <div><h3>Timeline History</h3><p>Read-only procedure milestones and supporting documents.</p></div>
      <span>{entries.length} record{entries.length === 1 ? "" : "s"}</span>
    </header>
    {error && <p className="modal-error" role="alert">{error}</p>}
    {loading ? <p className="timeline-history-state">Loading timeline history...</p> : entries.length ? <div className="timeline-history matter-view-timeline-history">
      {entries.map((entry) => <article className="timeline-history-item" key={entry.id}>
        <span className="timeline-dot" />
        <header><div><h4>{entry.procedure?.description ?? "Procedure"}</h4><p>{formatDate(entry.timeline_date)} <i>Â·</i> Timeline update</p></div></header>
        <p className="timeline-entry-description">{entry.description}</p>
        {entry.documents.length > 0 && <div className="timeline-document-list">
          {entry.documents.map((document) => <div className="timeline-document-row" key={document.id}>
            <span className="timeline-document-icon">{document.document_name.split(".").pop()?.toUpperCase().slice(0, 4) || "DOC"}</span>
            <span><b>{document.document_name}</b><small>{formatFileSize(document.document_size)} Â· {formatDate(document.created_at.slice(0, 10))}</small></span>
            <div className="timeline-document-actions">
              <button type="button" onClick={() => onViewDocument(entry, document)} disabled={openingDocumentId === document.id} data-action="view" title="View"><ActionIcon name="view" /><span className="aipt-action-label">{openingDocumentId === document.id ? "Opening..." : "View"}</span></button>
              <button type="button" onClick={() => onDownloadDocument(entry, document)} disabled={openingDocumentId === document.id} data-action="download" title="Download"><ActionIcon name="download" /><span className="aipt-action-label">Download</span></button>
            </div>
          </div>)}
        </div>}
      </article>)}
    </div> : <p className="timeline-history-state">No timeline entries have been recorded for this application.</p>}
  </section>;
}

function DeleteClientModal({ client, pending, error, onClose, onDelete }: { client: Client; pending: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  return <Modal className="delete-client-modal"><section className="delete-client"><button type="button" className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="warning-icon">!</span><h2>Delete Client</h2><p>Active applications must be archived first. Client deletion cannot be undone.</p><div className="delete-client-summary"><span>{initials(client.company_name)}</span><div><b>{client.company_name}</b><small>Client ID {client.assigned_id} | {client.email}</small></div></div>{error && <p className="modal-error" role="alert">{error}</p>}<footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={pending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button type="button" className="danger-primary" onClick={onDelete} disabled={pending} data-action="delete" title="Delete Client"><ActionIcon name="delete" /><span className="aipt-action-label">{pending ? "Deleting..." : "Delete Client"}</span></button></footer></section></Modal>;
}

function ArchiveMatterModal({ matter, pending, error, onClose, onArchive }: { matter: Matter; pending: boolean; error: string; onClose: () => void; onArchive: () => void }) {
  return <Modal className="delete-client-modal"><section className="delete-client archive-matter"><button type="button" className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="warning-icon">!</span><h2>Delete Application</h2><p>This application will be removed from the client record while its audit history remains available.</p><div className="delete-client-summary"><span>{matterTabLabel(matter.matter_type).slice(0, 2).toUpperCase()}</span><div><b>{matter.project_name}</b><small>{matter.aipt_ref_no} | {matter.service?.service ?? matterTabLabel(matter.matter_type)}</small></div></div>{error && <p className="modal-error" role="alert">{error}</p>}<footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={pending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button type="button" className="danger-primary" onClick={onArchive} disabled={pending} data-action="delete" title="Delete Application"><ActionIcon name="delete" /><span className="aipt-action-label">{pending ? "Deleting..." : "Delete Application"}</span></button></footer></section></Modal>;
}

function TimelineModal({ matter, client, procedures, entries, loading, error, draft, files, editing, pending, formError, deletingDocumentId, reportPending, reportError, onDraftChange, onFilesAdd, onFileRemove, onClose, onSave, onEdit, onCancelEdit, onDelete, onDeleteDocument, onDownloadDocument, onDownloadReport }: {
  matter: Matter;
  client: Client;
  procedures: Procedure[];
  entries: TimelineEntry[];
  loading: boolean;
  error: string;
  draft: TimelineDraft;
  files: File[];
  editing: TimelineEntry | null;
  pending: boolean;
  formError: string;
  deletingDocumentId: string | null;
  reportPending: boolean;
  reportError: string;
  onDraftChange: (draft: TimelineDraft) => void;
  onFilesAdd: (files: FileList | File[]) => void;
  onFileRemove: (index: number) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (entry: TimelineEntry) => void;
  onCancelEdit: () => void;
  onDelete: (entry: TimelineEntry) => void;
  onDeleteDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
  onDownloadDocument: (entry: TimelineEntry, document: TimelineDocument) => void;
  onDownloadReport: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const projectProcedures = procedures.filter((procedure) => procedure.service_id === matter.service_id);
  const update = <K extends keyof TimelineDraft,>(field: K, value: TimelineDraft[K]) => onDraftChange({ ...draft, [field]: value });
  const selectFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    onFilesAdd(selected);
    if (fileInput.current) fileInput.current.value = "";
  };

  return <Modal className="timeline-modal" elevated><section className="timeline-content">
    <header className="client-modal-heading timeline-heading"><div><span className="modal-kicker">CLIENT APPLICATION</span><h2>{editing ? "Edit Timeline Entry" : "Add Timeline"}</h2><p>Record procedure milestones and retain all supporting documents for this application.</p></div><div className="timeline-modal-actions"><button type="button" className="timeline-report-button" onClick={onDownloadReport} disabled={loading || reportPending} data-action="download" title="Download Report"><ActionIcon name="download" /><span className="aipt-action-label">{reportPending ? "Generating..." : "Download Report"}</span></button><button type="button" className="modal-close" onClick={onClose} disabled={pending || reportPending} aria-label="Close">x</button></div></header>

    <section className="timeline-project-information"><h3>Project Information</h3><div className="timeline-project-grid">
      <TimelineInfo label="Project" value={matter.project_name} />
      <TimelineInfo label="Service" value={matter.service?.service ?? matterTabLabel(matter.matter_type)} />
      <TimelineInfo label="Client" value={client.company_name} />
      <TimelineInfo label="Country" value={<span className="country-cell"><CountryFlag country={matter.country} compact />{matter.country?.name ?? "-"}</span>} />
      <TimelineInfo label="Procedure ID" value={matter.procedure?.description ?? "-"} />
      <TimelineInfo label="Filing Number" value={matter.filing_number ?? "-"} />
      <TimelineInfo label="Registered Number" value={matter.register_number ?? "-"} />
      <TimelineInfo label="Filing Date" value={formatDate(matter.filing_date)} />
      <TimelineInfo label="Registration Date" value={formatDate(matter.registered_date)} />
      <TimelineInfo label="Deadline" value={formatDate(matter.renewal_date)} />
    </div></section>
    {reportError && <p className="modal-error" role="alert">{reportError}</p>}

    <form className="timeline-entry-form" onSubmit={onSave}>
      <div className="timeline-section-heading"><h3>{editing ? "Update Timeline Entry" : "Add Timeline Entry"}</h3>{editing && <button type="button" className="text-action" onClick={onCancelEdit} disabled={pending} data-action="cancel" title="Cancel edit"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel edit</span></button>}</div>
      <div className="timeline-form-grid">
        <MatterField label="Procedure" required><select value={draft.procedure_id} onChange={(event) => update("procedure_id", event.target.value)} disabled={pending} required><option value="">Select procedure</option>{projectProcedures.map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.description}</option>)}</select></MatterField>
        <MatterField label="Timeline Date" required><input type="date" value={draft.timeline_date} onChange={(event) => update("timeline_date", event.target.value)} disabled={pending} required /></MatterField>
        <label className="timeline-description"><span>Description <em>*</em></span><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} disabled={pending} maxLength={5000} placeholder="Enter procedure update, outcome, or next action..." required /></label>
      </div>
      <section className="timeline-documents"><span>Documents <small>Multiple files allowed Â· saved to AWS S3 when you save</small></span><input ref={fileInput} className="timeline-file-input" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.svg,.doc,.docx,.xls,.xlsx" onChange={(event) => selectFiles(event.target.files)} /><div className="timeline-dropzone" role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(event) => event.key === "Enter" && fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFilesAdd(event.dataTransfer.files); }}><span className="timeline-upload-symbol">+</span><span><b>Click to upload</b> or drag and drop<small>PDF, PNG, JPG, SVG, DOC, DOCX, XLS, XLSX â€” max. 10MB each</small></span><button type="button" onClick={(event) => { event.stopPropagation(); fileInput.current?.click(); }}>Browse</button></div>{files.length > 0 && <div className="timeline-file-list">{files.map((file, index) => <div className="timeline-file-item" key={`${file.name}-${file.lastModified}-${index}`}><span><b>{file.name}</b><small>{formatFileSize(file.size)}</small></span><button type="button" onClick={() => onFileRemove(index)} disabled={pending} aria-label={`Remove ${file.name}`} data-action="delete" title="Remove"><ActionIcon name="delete" /><span className="aipt-action-label">Remove</span></button></div>)}</div>}</section>
      {formError && <p className="modal-error" role="alert">{formError}</p>}
      <footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={pending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button className="modal-primary" disabled={pending} data-action="update" title="Update Timeline"><ActionIcon name="update" /><span className="aipt-action-label">{pending ? "Saving..." : editing ? "Update Timeline" : "Save Timeline"}</span></button></footer>
    </form>

    <section className="timeline-history"><div className="timeline-section-heading"><h3>Timeline History</h3><span>{entries.length} record{entries.length === 1 ? "" : "s"}</span></div>{error && <p className="modal-error" role="alert">{error}</p>}{loading ? <p className="timeline-history-state">Loading timeline history...</p> : entries.length ? entries.map((entry) => <article className="timeline-history-item" key={entry.id}><span className="timeline-dot" /><header><div><h4>{entry.procedure?.description ?? "Procedure"}</h4><p>{formatDate(entry.timeline_date)} <i>Â·</i> Recorded by Administrator</p></div><div className="timeline-entry-actions"><button type="button" onClick={() => onEdit(entry)} disabled={pending} data-action="edit" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button><button type="button" className="danger" onClick={() => onDelete(entry)} disabled={pending} data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></div></header><p className="timeline-entry-description">{entry.description}</p>{entry.documents.length > 0 && <div className="timeline-document-list">{entry.documents.map((document) => <div className="timeline-document-row" key={document.id}><span className="timeline-document-icon">DOC</span><span><b>{document.document_name}</b><small>{formatFileSize(document.document_size)} Â· {formatDate(document.created_at.slice(0, 10))}</small></span><div><button type="button" onClick={() => onDownloadDocument(entry, document)} data-action="download" title="Download"><ActionIcon name="download" /><span className="aipt-action-label">Download</span></button><button type="button" className="danger" onClick={() => onDeleteDocument(entry, document)} disabled={deletingDocumentId === document.id} data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">{deletingDocumentId === document.id ? "Deleting..." : "Delete"}</span></button></div></div>)}</div>}</article>) : <p className="timeline-history-state">No timeline entries yet. Add the first procedure update above.</p>}</section>
  </section></Modal>;
}

function TimelineInfo({ label, value }: { label: string; value: ReactNode }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function DeleteTimelineModal({ entry, pending, error, onClose, onDelete }: { entry: TimelineEntry; pending: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  return <Modal className="delete-client-modal" elevated><section className="delete-client"><button type="button" className="modal-close" onClick={onClose} aria-label="Close">x</button><span className="warning-icon">!</span><h2>Delete Timeline Entry</h2><p>This entry and its attached documents will be removed from the active application timeline.</p><div className="delete-client-summary"><span>TL</span><div><b>{entry.procedure?.description ?? "Timeline procedure"}</b><small>{formatDate(entry.timeline_date)} | {entry.documents.length} document{entry.documents.length === 1 ? "" : "s"}</small></div></div>{error && <p className="modal-error" role="alert">{error}</p>}<footer className="client-modal-footer"><button type="button" className="secondary" onClick={onClose} disabled={pending} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button type="button" className="danger-primary" onClick={onDelete} disabled={pending} data-action="delete" title="Delete Timeline"><ActionIcon name="delete" /><span className="aipt-action-label">{pending ? "Deleting..." : "Delete Timeline"}</span></button></footer></section></Modal>;
}

function FormField({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={`form-field ${className}`}><span>{label}{required && <em>*</em>}</span>{children}</label>;
}

function MatterField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="matter-field"><span>{label}{required && <em>*</em>}</span>{children}</label>;
}

function Modal({ className, elevated = false, children }: { className: string; elevated?: boolean; children: ReactNode }) {
  return <div className={`client-modal-backdrop${elevated ? " modal-layer-top" : ""}`}><section className={`client-modal ${className}`}>{children}</section></div>;
}

function ProcedurePicker({ procedures, value, onChange, disabled = false }: { procedures: Procedure[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = procedures.find((procedure) => procedure.id === value) ?? null;
  const matches = procedures.filter((procedure) => procedure.description.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  return <div className="project-search-select" ref={ref}><button type="button" className={`project-search-trigger${open ? ' is-open' : ''}`} disabled={disabled} onClick={() => setOpen((current) => !current)} aria-expanded={open}><span className={selected ? '' : 'is-placeholder'}>{selected?.description ?? (disabled ? 'Select service first' : 'Select and search procedure')}</span><b>âŒ„</b></button>{open && !disabled && <div className="project-search-menu"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search procedures..."/><div className="project-search-results">{matches.length ? matches.map((procedure) => <button type="button" key={procedure.id} className={procedure.id === value ? 'is-selected' : ''} onClick={() => { onChange(procedure.id); setOpen(false); setQuery(''); }}><span>{procedure.description}</span>{procedure.id === value && <b>âœ“</b>}</button>) : <p>No matching procedures</p>}</div></div>}</div>;
}

function CountryPicker({ countries, value, onChange, disabled = false }: { countries: Country[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = countries.find((country) => country.id === value) ?? null;
  const matches = countries.filter((country) => `${country.name} ${country.abbreviation}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return <div className="country-picker" ref={ref}><button type="button" className="country-picker-trigger" disabled={disabled} onClick={() => setOpen((current) => !current)} aria-expanded={open}>{selected ? <><CountryFlag country={selected} compact /><span>{selected.name}</span></> : <span className="country-picker-placeholder">Select a country</span>}<b>v</b></button>{open && !disabled && <div className="country-picker-menu"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search countries..." />{matches.length ? <div>{matches.map((country) => <button key={country.id} type="button" className={country.id === value ? "selected" : ""} onClick={() => { onChange(country.id); setOpen(false); setQuery(""); }}><CountryFlag country={country} compact /><span>{country.name}</span><small>{country.abbreviation}</small></button>)}</div> : <p>No countries found.</p>}</div>}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status.toLowerCase().replace(/\s+/g, "-");
  return <span className={`client-status ${tone}`}>{status}</span>;
}

