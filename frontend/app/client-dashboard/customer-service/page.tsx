'use client';
import { useClientPermissions } from '../../../src/components/ClientPermissions';
import ActionIcon from '../../../src/components/ActionIcon';


import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

type Ticket = { id: string; subject: string; category: string; priority: string; status: 'Open' | 'Pending' | 'Resolved'; created_at: string; updated_at: string; unread_count?: number };
type Attachment = { id: string; file_name: string; file_size: number; file_type: string; is_image: boolean };
type Message = { id: string; sender_role: 'client' | 'administrator'; message: string; created_at: string; reply_to_id?: string | null; reply_to?: { id: string; message: string; sender_role: string } | null; attachments?: Attachment[] };
type StatusAction = { id: string; from_status: Ticket['status']; to_status: Ticket['status']; note?: string | null; created_at: string };
const emojis = ['😀','😂','😊','😍','👍','🙏','🎉','❤️','✅','👋','🤝','📎'];
const attachmentAccept = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.html,.htm,.msg,.eml';
const dateTime = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const requestCode = (ticket: Ticket) => `CS-${new Date(ticket.created_at).getFullYear()}${ticket.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

export default function ClientCustomerServicePage() {
  const router = useRouter(); const { can } = useClientPermissions('customer-service');
  const [statusDraft,setStatusDraft] = useState<Ticket['status']>('Open');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => { if (selected) setStatusDraft(selected.status); },[selected?.id,selected?.status]);
  const [statusActions, setStatusActions] = useState<StatusAction[]>([]);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('General Inquiry');
  const [priority, setPriority] = useState('Normal');
  const [firstMessage, setFirstMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [supportTyping, setSupportTyping] = useState(false);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const typingLastSentRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = useCallback(async (path = '', init: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error('Supabase is not configured.');
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw Error('Please sign in to contact customer support.');
    const isForm = init.body instanceof FormData;
    const response = await fetchSupabaseFunction(`customer-service${path}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...init.headers } });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) throw Error(body.error || 'Unable to reach customer support.');
    return body;
  }, [router]);

  const loadTickets = useCallback(async (preferredId?: string) => {
    const body = await api();
    const nextTickets: Ticket[] = body.tickets ?? [];
    setTickets(nextTickets);
    setSelected((current) => nextTickets.find((ticket) => ticket.id === (preferredId ?? current?.id)) ?? nextTickets[0] ?? null);
  }, [api]);

  const signalTyping = useCallback((typing = true) => {
    if (!selected) return;
    const now = Date.now();
    if (!typing || now - typingLastSentRef.current > 1500) {
      typingLastSentRef.current = now;
      void api(`/${selected.id}/typing`, { method: 'POST', body: JSON.stringify({ typing }) }).catch(() => undefined);
    }
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    if (typing) typingStopTimerRef.current = window.setTimeout(() => signalTyping(false), 2500);
  }, [api, selected]);

  useEffect(() => {
    const refresh = () => void loadTickets().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load support requests.')).finally(() => setLoading(false));
    refresh();
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [loadTickets]);
  useEffect(() => {
    if (!selected) { setMessages([]); setStatusActions([]); return; }
    const selectedId = selected.id;
    const refresh = () => void api(`/${selectedId}`).then((body) => {
      setMessages(body.messages ?? []);
      setStatusActions(body.status_actions ?? []);
      setSupportTyping(Boolean(body.other_typing));
      setTickets((current) => current.map((ticket) => ticket.id === selectedId ? { ...ticket, unread_count: 0 } : ticket));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load messages.'));
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => { window.clearInterval(timer); setSupportTyping(false); };
  }, [api, selected?.id]);

  useEffect(() => () => {
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
  }, []);

  useEffect(() => {
    const history = chatHistoryRef.current;
    if (history) history.scrollTo({ top: history.scrollHeight, behavior: 'smooth' });
  }, [messages.length, selected?.id, supportTyping]);

  const visibleTickets = tickets.filter((ticket) => `${ticket.subject} ${ticket.category} ${requestCode(ticket)}`.toLowerCase().includes(query.trim().toLowerCase()));

  const send = async () => {
    if (!selected || (!reply.trim() && !files.length) || saving) return;
    setSaving(true); setError('');
    try { const form = new FormData(); form.append('message', reply.trim()); if (replyTo) form.append('reply_to_id', replyTo.id); files.forEach((file) => form.append('files', file)); signalTyping(false); const created = await api(`/${selected.id}/messages`, { method: 'POST', body: form }); setMessages((current) => [...current, created]); setReply(''); setFiles([]); setReplyTo(null); setEmojiOpen(false); if (fileInputRef.current) fileInputRef.current.value = ''; await loadTickets(selected.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send your message.'); }
    finally { setSaving(false); }
  };

  const chooseFiles = (selectedFiles: FileList | null) => {
    const next = Array.from(selectedFiles ?? []);
    if (next.length > 5 || next.some((file) => file.size < 1 || file.size > 10 * 1024 * 1024)) { setError('Attach up to 5 files, with each file no larger than 10MB.'); return; }
    setError(''); setFiles(next);
  };
  const downloadAttachment = async (messageId: string, attachment: Attachment) => {
    try { const body = await api(`/${selected?.id}/messages/${messageId}/attachments/download-url?attachment_id=${attachment.id}`); window.open(body.url, '_blank', 'noopener,noreferrer'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to download the attachment.'); }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const created = await api('', { method: 'POST', body: JSON.stringify({ subject: subject.trim(), category, priority, message: firstMessage.trim() }) }); setModalOpen(false); setSubject(''); setCategory('General Inquiry'); setPriority('Normal'); setFirstMessage(''); await loadTickets(created.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create your request.'); }
    finally { setSaving(false); }
  };

  const chatFooter = <footer>
    <div className={'support-compose-extras'}>{replyTo && <div className={'support-reply-preview'}><span>Replying to {replyTo.sender_role === 'client' ? 'your message' : 'AIP&T Support'}<small>{replyTo.message || 'Attachment'}</small></span><button type={'button'} onClick={() => setReplyTo(null)}>×</button></div>}{files.length > 0 && <div className={'support-selected-files'}>{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}<button type={'button'} onClick={() => setFiles((current) => current.filter((item) => item !== file))}>×</button></span>)}</div>}</div>
    <div className={'support-compose-row'}><input ref={fileInputRef} type={'file'} hidden multiple accept={attachmentAccept} onChange={(event) => chooseFiles(event.target.files)} /><button className={'support-tool-button'} type={'button'} aria-label={'Attach files'} title={'Attach files'} disabled={!selected || saving} onClick={() => fileInputRef.current?.click()}>📎</button><button className={'support-tool-button'} type={'button'} aria-label={'Add emoji'} title={'Add emoji'} disabled={!selected || saving} onClick={() => setEmojiOpen((value) => !value)}>😊</button>{emojiOpen && <div className={'support-emoji-picker'}>{emojis.map((emoji) => <button type={'button'} key={emoji} onClick={() => { setReply((value) => `${value}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
    <textarea
      aria-label={'Message'}
      value={reply}
      disabled={!selected || saving}
      onChange={(event) => { setReply(event.target.value); signalTyping(Boolean(event.target.value.trim())); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          void send();
        }
      }}
      placeholder={selected ? 'Type your message...' : 'Create a support request to begin...'}
      maxLength={5000}
    />
    <button data-action="add" className={'support-send-button'} type={'button'} disabled={!selected || (!reply.trim() && !files.length) || saving} onClick={() => void send()}>
      ➤ <span>Send</span>
    </button></div>
  </footer>;

  const chatHeader = <header>
    <div><h2>Chat with Support Agent <span>Online</span></h2>{selected && <em className={`customer-status ${selected.status.toLowerCase()}`}>{selected.status}</em>}</div>
    <div className={'support-agent'}><b>Customer Support</b><small>AIP&amp;T Support Team</small></div>
  </header>;

  const chatHistory = <div className={'client-chat-history'} ref={chatHistoryRef}>
    {loading && <p className={'client-empty'}>Loading conversation...</p>}
    {!loading && !selected && <div className={'client-chat-welcome'}>
      <h3>How can we help?</h3>
      <p>Create a support request to start a secure conversation with our team.</p>
      <button type={'button'} onClick={() => setModalOpen(true)}>Start a conversation</button>
    </div>}
    {!loading && selected && messages.map((message) => <article key={message.id} className={message.sender_role === 'client' ? 'from-client' : 'from-support'}>
      {message.reply_to && <blockquote><small>Reply to {message.reply_to.sender_role === 'client' ? 'Client' : 'AIP&T Support'}</small>{message.reply_to.message || 'Attachment'}</blockquote>}
      <b>{message.sender_role === 'client' ? 'You' : 'AIP&T Support'} <time>{dateTime(message.created_at)}</time></b>
      {message.message && <p>{message.message}</p>}
      {Boolean(message.attachments?.length) && <div className={'support-attachments'}>{message.attachments!.map((attachment) => <button type={'button'} key={attachment.id} onClick={() => void downloadAttachment(message.id, attachment)}><span>{attachment.is_image ? '🖼️' : '📄'}</span><b>{attachment.file_name}<small>{Math.ceil(attachment.file_size / 1024)} KB</small></b></button>)}</div>}
      <button className={'support-reply-button'} type={'button'} onClick={() => setReplyTo(message)}>Reply</button>
    </article>)}
    {statusActions.map((action) => <article className={'client-status-action'} key={action.id}><b>Conversation status changed</b><p>{action.from_status} → {action.to_status}</p>{action.note && <blockquote>{action.note}</blockquote>}<time>{dateTime(action.created_at)}</time></article>)} 
    {supportTyping && <div className={'support-typing-indicator'} role={'status'} aria-live={'polite'}><span><i></i><i></i><i></i></span><b>AIP&amp;T Support is typing...</b></div>}
  </div>;

  const updateStatus = async () => {
    if (!selected || !can('update')) return;
    setSaving(true);
    try { await api(`/${selected.id}`,{ method:'PUT',body:JSON.stringify({ status:statusDraft }) }); await loadTickets(selected.id); }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'Unable to update ticket.'); }
    finally { setSaving(false); }
  };
  const deleteTicket = async () => {
    if (!selected || !can('delete') || window.prompt(`Delete "${selected.subject}"? Type DELETE to confirm.`) !== 'DELETE') return;
    setSaving(true);
    try { await api(`/${selected.id}`,{ method:'DELETE' }); await loadTickets(); }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete ticket.'); }
    finally { setSaving(false); }
  };
  const requestModal = modalOpen && <div className={'support-modal-backdrop'}>
    <section className={'support-request-modal'} role={'dialog'} aria-modal={true}>
      <header><div><h2>New Support Request</h2><p>Tell us what you need help with.</p></div><button type={'button'} aria-label={'Close'} onClick={() => setModalOpen(false)} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button></header>
      <form onSubmit={create} data-action="add">
        <label>Subject<input required minLength={3} maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <div>
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>General Inquiry</option><option>Trademark</option><option>Patent</option><option>Design</option><option>Copyright</option><option>Billing</option><option>Technical Support</option></select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
        </div>
        <label>Your message<textarea required maxLength={5000} value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} /></label>
        <footer><button type={'button'} onClick={() => setModalOpen(false)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button><button disabled={saving}>{saving ? 'Sending...' : 'Send Request'}</button></footer>
      </form>
    </section>
  </div>;

  return <section className={'client-support-page'}>
    <div className={'client-support-hero'}>
      <div><h1>Customer Support</h1></div>
      <button type={'button'} onClick={() => setModalOpen(true)} data-action="add" title="New Support Request"><ActionIcon name="add" /><span className="aipt-action-label">New Support Request</span></button>
    </div>
    {error && <p className={'client-error'} role={'alert'}>{error}</p>}
    <div className={'client-support-layout'}>
      <aside className={'client-conversation-list'}>
        <header><div><h2>My Conversations</h2><p>{tickets.length} support {tickets.length === 1 ? 'request' : 'requests'}</p></div><button type={'button'} onClick={() => setModalOpen(true)} data-action="add" aria-label={'New support request'}>+</button></header>
        <label><span aria-hidden={true}>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search conversations...'} /></label>
        <div>{visibleTickets.map((ticket) => <button type={'button'} className={`client-conversation-row${selected?.id === ticket.id ? ' selected' : ''}${ticket.unread_count ? ' has-unread' : ''}`} onClick={() => setSelected(ticket)} key={ticket.id}>
          <span>{ticket.subject.slice(0, 2).toUpperCase()}</span><b>{ticket.subject}<small>{requestCode(ticket)} · {dateTime(ticket.updated_at)}</small></b><em>{ticket.status}</em>{Boolean(ticket.unread_count) && <mark>{ticket.unread_count}</mark>}
        </button>)}{!loading && !visibleTickets.length && <p className={'client-empty'}>No conversations found.</p>}</div>
      </aside>
      <section className={'client-chat-card'}>{chatHeader}{chatHistory}{chatFooter}</section>
    </div>
    {selected && <div className="client-toolbar" aria-label="Ticket permissions">{can('edit') && <label>Status<select aria-label="Ticket status" value={statusDraft} onChange={event => setStatusDraft(event.target.value as Ticket['status'])}><option>Open</option><option>Pending</option><option>Resolved</option></select></label>}{can('update') && <button disabled={saving} onClick={() => void updateStatus()}>Update ticket status</button>}{can('delete') && <button disabled={saving} onClick={() => void deleteTicket()}>Delete ticket</button>}</div>}{requestModal}
  </section>;
}
