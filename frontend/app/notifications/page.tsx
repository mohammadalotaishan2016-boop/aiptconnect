'use client';
import ActionIcon from '../../src/components/ActionIcon';
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchSupabaseFunction, getSupabaseBrowserClient } from "../../src/lib/supabase/browser";
type Country = {
  id: string;
  name: string;
  abbreviation: string;
  flag_url: string;
};
type Notification = {
  id: string;
  notification_date: string;
  created_at: string | null;
  updated_at: string | null;
  description: string;
  document_key: string | null;
  document_name: string | null;
  document_size: number | null;
  document_type: string | null;
  aws_metadata?: { size_bytes: number | null; content_type: string | null; last_modified: string | null; etag: string | null } | null;
  countries: Array<{ country: Country }>;
};
type Modal = "add" | "view" | "edit" | "delete" | null;
const toDateTimeLocal = (value: Date | string = new Date()) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
function CountryFlag({ country }: { country: Country }) {
  const [failed, setFailed] = useState(false);
  return country.flag_url && !failed ? (
    <img className="country-select-flag" src={country.flag_url} alt="" onError={() => setFailed(true)} />
  ) : (
    <span className="country-select-flag country-select-flag-fallback">
      {country.abbreviation.slice(0, 2).toUpperCase()}
    </span>
  );
}
function formatFileSize(value: number | null) {
  if (value === null) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
export default function NotificationsPage() {
  const [pageSize, setPageSize] = useState(10);
  const [items, setItems] = useState<Notification[]>([]),
    [countries, setCountries] = useState<Country[]>([]),
    [selected, setSelected] = useState<Notification | null>(null),
    [modal, setModal] = useState<Modal>(null);
  const [date, setDate] = useState(""),
    [filterDate, setFilterDate] = useState(""),
    [filterCountry, setFilterCountry] = useState(""),
    [filterYear, setFilterYear] = useState(""),
    [description, setDescription] = useState(""),
    [countryIds, setCountryIds] = useState<string[]>([]),
    [file, setFile] = useState<File | null>(null),
    [countrySearch, setCountrySearch] = useState(""),
    [countryOpen, setCountryOpen] = useState(false),
    [query, setQuery] = useState(""),
    [searchInput, setSearchInput] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<Notification | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const countrySelectRef = useRef<HTMLDivElement>(null);
  const validateDocument = (nextFile: File | null) => {
    if (!nextFile) return true;
    const accepted = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/svg+xml",
    ];
    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "svg"].includes(extension) || (nextFile.type && !accepted.includes(nextFile.type))) {
      setError("Choose a PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, or SVG file.");
      return false;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError("The document must be 10MB or smaller.");
      return false;
    }
    setError("");
    setFile(nextFile);
    return true;
  };
  const request = useCallback(
    async (endpoint: string, path = "", options: RequestInit = {}) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw Error("Supabase is not configured.");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error("Please sign in.");
        const response = await fetchSupabaseFunction(`${endpoint}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...options.headers,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(body.error ?? "Request failed.");
      }
      return response.status === 204 ? null : response.json();
    },
    [],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, countryData] = await Promise.all([
        request("notifications"),
        request("countries"),
      ]);
      setItems(data as Notification[]);
      setCountries(countryData as Country[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!countryOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!countrySelectRef.current?.contains(event.target as Node)) {
        setCountryOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCountryOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [countryOpen]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? items.filter((item) =>
          `${item.description} ${item.document_name ?? ""} ${item.countries.map((value) => value.country.name).join(" ")}`
            .toLowerCase()
            .includes(term),
        )
      : items;
  }, [items, query]);
  const categorized = useMemo(() => filtered.filter(item => {
    const published = new Date(item.notification_date);
    return (!filterDate || published.toISOString().slice(0, 10) === filterDate)
      && (!filterYear || String(published.getFullYear()) === filterYear)
      && (!filterCountry || item.countries.some(value => value.country.id === filterCountry))
      ;
  }), [filtered, filterDate, filterYear, filterCountry]);
  const pages = Math.max(1, Math.ceil(categorized.length / pageSize)),
    current = Math.min(page, pages),
    visible = categorized.slice((current - 1) * pageSize, current * pageSize);
  const clearFilters = () => { setSearchInput(""); setQuery(""); setFilterDate(""); setFilterYear(""); setFilterCountry(""); setPage(1); };
  const open = (kind: Exclude<Modal, null>, item?: Notification) => {
    setSelected(item ?? null);
    setDate(
      item ? toDateTimeLocal(item.notification_date) : toDateTimeLocal(),
    );
    setDescription(item?.description ?? "");
    setCountryIds(item?.countries.map((value) => value.country.id) ?? []);
    setCountrySearch("");
    setCountryOpen(false);
    setFile(null);
    setError("");
    setModal(kind);
  };
  const close = () => !saving && (setModal(null), setError(""));
  const toggleCountry = (countryId: string) => {
    setCountryIds((currentIds) =>
      currentIds.includes(countryId)
        ? currentIds.filter((id) => id !== countryId)
        : [...currentIds, countryId],
    );
  };
  const matchingCountries = countries.filter((country) =>
    `${country.name} ${country.abbreviation}`
      .toLowerCase()
      .includes(countrySearch.trim().toLowerCase()),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!date) return setError("Choose a notification date.");
    if (description.trim().length < 3)
      return setError("Description must contain at least 3 characters.");
    if (!countryIds.length) return setError("Select at least one country.");
    if (modal === "add" && !file) return setError("Choose a document to upload.");
    setSaving(true);
    setError("");
    try {
      let document = {
        document_key: selected?.document_key ?? null,
        document_name: selected?.document_name ?? null,
        document_size: selected?.document_size ?? null,
        document_type: selected?.document_type ?? null,
      };
      if (file) {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase!.auth.getSession();
        const form = new FormData();
        form.append("file", file);
        const upload = await fetchSupabaseFunction("notifications/upload?permission_action=" + (selected ? "update" : "add"), {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
          body: form,
        });
        const uploaded = await upload.json().catch(() => ({}));
        if (!upload.ok) throw Error(uploaded.error ?? "Document upload to AWS failed.");
        document = {
          document_key: uploaded.key,
          document_name: uploaded.document_name,
          document_size: uploaded.document_size,
          document_type: uploaded.document_type,
        };
      }
      const saved = (await request(
        "notifications",
        modal === "edit" ? `/${selected?.id}` : "",
        {
          method: modal === "edit" ? "PUT" : "POST",
          body: JSON.stringify({
            notification_date: new Date(date).toISOString(),
            description: description.trim(),
            country_ids: countryIds,
            ...document,
          }),
        },
      )) as Notification;
      setItems((currentItems) =>
        modal === "edit"
          ? currentItems.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...currentItems],
      );
      setNotice(
        modal === "edit"
          ? "Notification updated successfully."
          : "Notification added successfully.",
      );
      setModal(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save notification.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await request("notifications", `/${selected.id}`, { method: "DELETE" });
      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== selected.id),
      );
      setNotice("Notification deleted successfully.");
      setModal(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete notification.",
      );
    } finally {
      setSaving(false);
    }
  };
  const downloadDocument = async (item: Notification) => {
    try {
      const body = await request("notifications", `/${item.id}/download-url`);
      window.open(body.url, "_blank");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to download document.",
      );
    }
  };
  const exportFile = (content: string, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([content], { type })),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `notifications-${new Date().toISOString().slice(0, 10)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };
  const rows = () =>
    filtered.map((item) => [
      item.notification_date,
      item.description,
      item.countries.map((value) => value.country.name).join("; "),
      item.document_name ?? "",
    ]);
  const csv = () => exportFile("\uFEFFDate,Description,Countries,Document\r\n" + rows().map(row => row.map(value => `"${value.split('"').join('""')}"`).join(",")).join("\r\n"), "text/csv", "csv");
  const word = () => exportFile(`<html><body><h1>Notifications</h1><table border="1"><tr><th>Date</th><th>Description</th><th>Countries</th><th>Document</th></tr>${rows().map(row => `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</table></body></html>`, "application/msword", "doc");
  const pdf = () => {
    const popup = window.open("", "_blank");
    if (!popup) return setError("Allow pop-ups to export PDF.");
    popup.document.write(`<h1>Notifications</h1><table border="1" cellspacing="0" cellpadding="8">${rows().map(row => `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</table><script>window.onload=()=>window.print()<\/script>`);
    popup.document.close();
    setExportOpen(false);
  };
  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target.files?.[0];
    event.target.value = "";
    if (!input) return;
    setSaving(true);
    try {
      const lines = (await input.text())
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(Boolean);
      const parse = (line: string) =>
        (line.match(/("(?:[^"]|"")*"|[^,]+)(?=,|$)/g) ?? []).map((value) =>
          value.replace(/^"|"$/g, "").split('""').join('"'),
        );
      let count = 0;
      for (const line of lines.slice(1)) {
        const values = parse(line),
          matched = values[2]
            .split(";")
            .map(
              (name) =>
                countries.find(
                  (country) =>
                    country.name.toLowerCase() === name.trim().toLowerCase(),
                )?.id,
            )
            .filter((id): id is string => !!id);
        if (!values[0] || !values[1] || !matched.length) continue;
        await request("notifications", "", {
          method: "POST",
          body: JSON.stringify({
            notification_date: new Date(values[0]).toISOString(),
            description: values[1],
            country_ids: matched,
          }),
        });
        count++;
      }
      await load();
      setNotice(`${count} notifications imported.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  };
  const dateOptions = Array.from(new Set(items.map(item => new Date(item.notification_date).toISOString().slice(0, 10)))).sort().reverse();
  const yearOptions = Array.from(new Set(items.map(item => String(new Date(item.notification_date).getFullYear())))).sort().reverse();
  const totalCountries = new Set(items.flatMap(item => item.countries.map(entry => entry.country.id))).size;
  const withDocuments = items.filter(item => Boolean(item.document_key || item.document_name)).length;
  const [clientView, setClientView] = useState(false);
  useEffect(() => setClientView(window.location.pathname.startsWith('/client-dashboard/')), []);
  const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  const timeLabel = (value: string) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const fileBadge = (item: Notification) => (item.document_name?.split('.').pop() || item.document_type?.split('/').pop() || 'FILE').replace('vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX').replace('vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX').slice(0, 4).toUpperCase();
  const applySearch = () => { setQuery(searchInput); setPage(1); };
  const applyFilters = () => setPage(1);
  const recent = [...items].sort((a, b) => Date.parse(b.notification_date) - Date.parse(a.notification_date)).slice(0, 5);
  return (
    <main className={`procedure-page notification-page${clientView ? ' client-notification-feed' : ''}`}><section className="notification-news-shell">
      <header className="countries-topbar notification-admin-topbar"><p>Home <i>/</i> <b>Notifications</b></p><div className="top-profile"><span>MS</span><b>Notifications<small>News Feeds</small></b></div></header>
      <header className="notification-feed-header"><div><h1>News Feed</h1><p>Stay updated with the latest notifications.</p></div><strong>{loading ? 'Loading notifications...' : `${items.length} total notifications`}</strong></header>
      <section className="notification-feed-stats" aria-label="Notification statistics"><div><span>Total notifications</span><strong>{loading ? 'â€”' : items.length}</strong></div><div><span>With documents</span><strong>{loading ? 'â€”' : withDocuments}</strong></div><div><span>Countries covered</span><strong>{loading ? 'â€”' : totalCountries}</strong></div><div><span>Records displayed</span><strong>{loading ? 'â€”' : categorized.length}</strong></div></section>
      <div className="notification-searchbar"><input aria-label="Search news by title or content" value={searchInput} onChange={event => setSearchInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applySearch(); }} placeholder={clientView ? 'Search by description, country...' : 'Search descriptions, document names, and countries...'} /><button type="button" onClick={applySearch}>Search</button></div>
      {notice && <div className="country-toast" role="status">{notice}<button type="button" onClick={() => setNotice('')}>Ã—</button></div>}
      <div className="notification-feed-layout"><div className="notification-feed-main">
        <section className="notification-feed-list">{error && !modal && <p className="country-page-error" role="alert">{error}</p>}{loading ? <p className="notification-feed-state">Loading notifications from the database...</p> : visible.length ? <div className="notification-card-list">{visible.map(item => { const firstCountry = item.countries[0]?.country; const timestamp = new Date(item.notification_date); const createdAt = item.created_at || null; const updatedAt = item.updated_at || null; const fileSize = item.document_size ?? item.aws_metadata?.size_bytes ?? null; const fileType = item.document_type || item.aws_metadata?.content_type || null; const storedAt = item.aws_metadata?.last_modified || null; const storedSize = item.aws_metadata?.size_bytes ?? null; return <article className="notification-news-card" key={item.id}><div className="notification-news-copy"><h2>{item.description}</h2><button className="notification-read-more" type="button" onClick={() => setDetailsItem(item)}>Read More</button><div className="notification-admin-actions"><button type="button" onClick={() => open('view', item)}>Details</button><button type="button" data-action="edit" onClick={() => open('edit', item)}>Edit</button><button type="button" data-action="delete" onClick={() => open('delete', item)}>Delete</button></div></div><div className="notification-news-meta"><strong>{firstCountry && <CountryFlag country={firstCountry} />}<span>{item.countries.map(value => value.country.name).join(', ') || 'All countries'}</span></strong><span>{dateLabel(item.notification_date)}</span><span>{timeLabel(item.notification_date)}</span><b className="notification-year-badge">{timestamp.getFullYear()}</b>{item.document_name && <div className="notification-document-details"><span>{fileType || 'File type unavailable'}{formatFileSize(fileSize) ? ` · ${formatFileSize(fileSize)}` : ''}</span><button type="button" onClick={() => void downloadDocument(item)} disabled={!item.document_key}>{item.document_name} · Download</button></div>}{clientView && <div className="client-notification-record-data"><span><b>Record ID</b><code>{item.id}</code></span><span><b>Country codes</b>{item.countries.map(value => value.country.abbreviation).filter(Boolean).join(', ') || 'None'}</span>{item.document_name && <><span><b>Storage key</b><code>{item.document_key || 'Unavailable'}</code></span><span><b>Stored content type</b>{item.aws_metadata?.content_type || 'Unavailable'}</span><span><b>Stored size</b>{formatFileSize(storedSize) || 'Unavailable'}</span><span><b>Storage updated</b>{storedAt ? `${dateLabel(storedAt)} ${timeLabel(storedAt)}` : 'Unavailable'}</span><span><b>ETag</b><code>{item.aws_metadata?.etag || 'Unavailable'}</code></span></>}{<span><b>Created</b>{createdAt ? `${dateLabel(createdAt)} ${timeLabel(createdAt)}` : 'Unavailable'}</span>}<span><b>Last updated</b>{updatedAt ? `${dateLabel(updatedAt)} ${timeLabel(updatedAt)}` : 'Unavailable'}</span></div>}</div></article>; })}</div> : <p className="notification-feed-state">No notifications match the current search or filters.</p>}<footer className="notification-feed-pagination"><span>Showing {categorized.length ? (current - 1) * pageSize + 1 : 0} to {Math.min(current * pageSize, categorized.length)} of {categorized.length} records</span><label>Rows<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><nav aria-label="Notifications pagination"><button type="button" onClick={() => setPage(1)} disabled={loading || current <= 1}>First</button><button type="button" onClick={() => setPage(current - 1)} disabled={loading || current <= 1}>Previous</button><b>{current} / {pages}</b><button type="button" onClick={() => setPage(current + 1)} disabled={loading || current >= pages}>Next</button><button type="button" onClick={() => setPage(pages)} disabled={loading || current >= pages}>Last</button></nav></footer></section>
      </div><aside className="notification-feed-sidebar"><section className="notification-sidebar-panel"><header>Filter News</header><div className="notification-filter-fields"><label>By Date<select value={filterDate} onChange={event => setFilterDate(event.target.value)}><option value="">All Dates</option>{dateOptions.map(value => <option value={value} key={value}>{dateLabel(value)}</option>)}</select></label><label>By Country<select value={filterCountry} onChange={event => setFilterCountry(event.target.value)}><option value="">All Countries</option>{countries.map(country => <option value={country.id} key={country.id}>{country.name}</option>)}</select></label><label>By Year<select value={filterYear} onChange={event => setFilterYear(event.target.value)}><option value="">All Years</option>{yearOptions.map(value => <option value={value} key={value}>{value}</option>)}</select></label><button type="button" onClick={applyFilters}>Apply Filters</button><button type="button" className="notification-clear-filters" onClick={clearFilters}>Clear filters</button></div></section><section className="notification-sidebar-panel notification-recent-panel"><header>Recent News</header>{recent.map(item => <button type="button" key={item.id} onClick={() => setDetailsItem(item)}><b>{item.description}</b><small>{dateLabel(item.notification_date)}</small></button>)}</section></aside></div>
      {detailsItem && <div className="notification-details-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDetailsItem(null); }}><section className="notification-details-modal" role="dialog" aria-modal="true" aria-labelledby="notification-details-title"><button className="notification-details-close" type="button" onClick={() => setDetailsItem(null)} aria-label="Close">Ã—</button><span className="notification-category-badge">{detailsItem.document_type || detailsItem.document_name?.split('.').pop()?.toUpperCase() || 'Announcement'}</span><h2 id="notification-details-title">{detailsItem.description}</h2><div className="notification-detail-meta">{detailsItem.countries.map(value => <span key={value.country.id}>{value.country.name}</span>)}<span>{dateLabel(detailsItem.notification_date)} Â· {timeLabel(detailsItem.notification_date)} Â· {new Date(detailsItem.notification_date).getFullYear()}</span></div>{detailsItem.document_name && <div className="notification-details-document"><strong>Attachment:</strong> {detailsItem.document_name}<br /><strong>Type:</strong> {detailsItem.document_type || "Unavailable"}<br /><strong>Size:</strong> {formatFileSize(detailsItem.document_size) || "Unavailable"}<br /><button type="button" className="notification-read-more" onClick={() => void downloadDocument(detailsItem)} disabled={!detailsItem.document_key}>Download document</button></div>}</section></div>}
      {modal && (
        <div className="country-modal-backdrop" onMouseDown={close}>
          <section
            className="country-modal notification-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {modal === "delete" && selected ? (
              <>
                <header className="country-panel-heading delete-title">
                  <i>â™²</i>
                  <div>
                    <h2>Delete Notification</h2>
                    <small>This action cannot be undone.</small>
                  </div>
                  <button onClick={close}>Ã—</button>
                </header>
                <NotificationSummary item={selected} />
                {error && <p className="country-form-error">{error}</p>}
                <footer className="country-panel-footer">
                  <button onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                  <button
                    className="delete-primary"
                    disabled={saving}
                    onClick={remove}
                   data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                </footer>
              </>
            ) : modal === "view" && selected ? (
              <>
                <header className="country-panel-heading">
                  <h2>Notification Details</h2>
                  <button onClick={close}>Ã—</button>
                </header>
                <NotificationSummary item={selected} />
                <footer className="country-panel-footer">
                  <button onClick={close} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button>
                </footer>
              </>
            ) : (
              <>
                <header className="country-panel-heading">
                  <h2>
                    {modal === "add"
                      ? "Add New Notification"
                      : "Edit Notification"}
                  </h2>
                  <button onClick={close}>Ã—</button>
                </header>
                <form onSubmit={save}>
                  <label className="country-label">
                    <span className="notification-field-label">Date <em>*</em></span>
                    <div className="notification-date-control">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
                      <input
                        type="datetime-local"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                    </div>
                  </label>
                  <label className="country-label">
                    <span className="notification-field-label">Description <em>*</em></span>
                    <textarea
                      maxLength={500}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Enter notification description..."
                    />
                    <small className="notification-character-count">{description.length}/500</small>
                  </label>
                  <div className="country-label">
                    <span className="notification-field-label">Countries <em>*</em></span>
                    <div className="country-multiselect" ref={countrySelectRef}>
                      <div className="country-search-control">
                        <span aria-hidden="true">âŒ•</span>
                        <input value={countrySearch} onFocus={() => setCountryOpen(true)} onChange={(event) => { setCountrySearch(event.target.value); setCountryOpen(true); }} placeholder={countryIds.length ? "Search to add another country..." : "Search and select countries..."} />
                        <button type="button" aria-label="Toggle country list" onClick={() => setCountryOpen((open) => !open)}>âŒ„</button>
                      </div>
                      {countryIds.length > 0 && <div className="country-tags">{countryIds.map((id) => { const country = countries.find((value) => value.id === id); return country ? <button type="button" key={id} onClick={() => toggleCountry(id)}><CountryFlag country={country} /><span>{country.name}</span><i aria-hidden="true">Ã—</i></button> : null; })}</div>}
                      {countryOpen && <div className="country-options">{matchingCountries.length ? matchingCountries.map((country) => <button type="button" className={countryIds.includes(country.id) ? "is-selected" : ""} key={country.id} onClick={() => toggleCountry(country.id)}><CountryFlag country={country} /><span>{country.name}<small>{country.abbreviation}</small></span><i aria-hidden="true">{countryIds.includes(country.id) ? "âœ“" : ""}</i></button>) : <p>No countries match your search.</p>}</div>}
                    </div>
                    <small>Search and select one or more countries.</small>
                  </div>
                  <label className="country-label">
                    <span className="notification-field-label">Document to Download <em>*</em></span>
                    <input ref={documentRef} className="notification-file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.svg" onChange={(event) => validateDocument(event.target.files?.[0] ?? null)} />
                    <div className="notification-dropzone" role="button" tabIndex={0} onClick={() => documentRef.current?.click()} onKeyDown={(event) => event.key === "Enter" && documentRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); validateDocument(event.dataTransfer.files?.[0] ?? null); }}>
                      <span className="notification-upload-icon">â‡§</span>
                      <span><b>{file ? file.name : "Click to upload"}</b>{!file && " or drag and drop"}<small>{file ? `${Math.ceil(file.size / 1024)} KB selected` : "PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, SVG (Max. 10MB)"}</small></span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); documentRef.current?.click(); }}>Browse</button>
                    </div>
                    <small>
                      {file?.name ??
                        selected?.document_name ??
                        "PDF, DOC, DOCX, XLS, XLSX â€” maximum 10MB"}
                    </small>
                  </label>
                  {error && <p className="country-form-error">{error}</p>}
                  <footer className="country-panel-footer">
                    <button type="button" onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                    <button disabled={saving} data-action={selected ? "update" : "add"} title="Save Notification"><ActionIcon name="update" /><span className="aipt-action-label">
                      {saving
                        ? "Savingâ€¦"
                        : modal === "add"
                          ? "Save Notification"
                          : "Update Notification"}
                    </span></button>
                  </footer>
                </form>
              </>
            )}
          </section>
        </div>
      )}
      </section>
    </main>
  );
}
function NotificationSummary({ item }: { item: Notification }) {
  return (
    <div className="country-delete-summary">
      <span>Date</span>
      <b>: {new Date(item.notification_date).toLocaleString()}</b>
      <span>Description</span>
      <b>: {item.description}</b>
      <span>Countries</span>
      <b>: {item.countries.map((value) => value.country.name).join(", ")}</b>
      <span>Document</span>
      <b>: {item.document_name ?? "None"}</b>
    </div>
  );
}
