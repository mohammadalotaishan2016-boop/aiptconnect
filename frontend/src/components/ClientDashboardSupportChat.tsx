'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import type { DashboardLanguage } from './ClientDashboardLanguageSelector';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';

type SupportChatText = {
  support: string;
  drag: string;
  minimize: string;
  maximize: string;
  close: string;
  subject: string;
  category: string;
  message: string;
  messagePlaceholder: string;
  send: string;
  sending: string;
  sent: string;
  sentDetails: string;
  viewRequests: string;
  general: string;
  technical: string;
};

const translations: Record<DashboardLanguage, SupportChatText> = {
  en: { support: 'AIP&T Customer Service', drag: 'Drag to move', minimize: 'Minimize chat', maximize: 'Maximize chat', close: 'Close chat', subject: 'Subject', category: 'Category', message: 'How can we help?', messagePlaceholder: 'Describe what you need help with...', send: 'Send request', sending: 'Sending...', sent: 'Request sent', sentDetails: 'Your request has been sent to the AIP&T support team.', viewRequests: 'View my support requests', general: 'General Inquiry', technical: 'Technical Support' },
  ar: { support: 'خدمة عملاء AIP&T', drag: 'اسحب للتحريك', minimize: 'تصغير المحادثة', maximize: 'تكبير المحادثة', close: 'إغلاق المحادثة', subject: 'الموضوع', category: 'الفئة', message: 'كيف يمكننا مساعدتك؟', messagePlaceholder: 'اشرح ما تحتاج إلى المساعدة فيه...', send: 'إرسال الطلب', sending: 'جارٍ الإرسال...', sent: 'تم إرسال الطلب', sentDetails: 'تم إرسال طلبك إلى فريق دعم AIP&T.', viewRequests: 'عرض طلبات الدعم', general: 'استفسار عام', technical: 'الدعم الفني' },
  fil: { support: 'Serbisyo sa Customer ng AIP&T', drag: 'I-drag upang ilipat', minimize: 'I-minimize ang chat', maximize: 'I-maximize ang chat', close: 'Isara ang chat', subject: 'Paksa', category: 'Kategorya', message: 'Paano kami makakatulong?', messagePlaceholder: 'Ilarawan kung saan mo kailangan ng tulong...', send: 'Ipadala ang kahilingan', sending: 'Ipinapadala...', sent: 'Naipadala ang kahilingan', sentDetails: 'Naipadala na ang iyong kahilingan sa team ng suporta ng AIP&T.', viewRequests: 'Tingnan ang aking mga kahilingan', general: 'Pangkalahatang Tanong', technical: 'Teknikal na Suporta' },
  zh: { support: 'AIP&T 客户服务', drag: '拖动以移动', minimize: '最小化聊天', maximize: '最大化聊天', close: '关闭聊天', subject: '主题', category: '类别', message: '我们能为您提供什么帮助？', messagePlaceholder: '请描述您需要帮助的内容…', send: '发送请求', sending: '正在发送…', sent: '请求已发送', sentDetails: '您的请求已发送给 AIP&T 支持团队。', viewRequests: '查看我的支持请求', general: '一般咨询', technical: '技术支持' },
};

export default function ClientDashboardSupportChat({ context, language, onClose }: { context: string; language: DashboardLanguage; onClose: () => void }) {
  const text = translations[language];
  const [subject, setSubject] = useState(`${context} — ${text.support}`);
  const [category, setCategory] = useState('General Inquiry');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    setSubject(`${context} — ${text.support}`);
    setMessage('');
    setError('');
    setSent(false);
  }, [context, language, text.support]);

  useEffect(() => {
    const constrainToViewport = () => {
      const bounds = panel.current?.getBoundingClientRect();
      if (!bounds) return;
      setPosition((current) => current ? {
        left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, current.left)),
        top: Math.max(8, Math.min(window.innerHeight - 52, current.top)),
      } : current);
    };
    window.addEventListener('resize', constrainToViewport);
    return () => window.removeEventListener('resize', constrainToViewport);
  }, []);

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffset.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setPosition({ left: bounds.left, top: bounds.top });
  };

  const drag = (event: PointerEvent<HTMLElement>) => {
    if (!dragOffset.current || !panel.current) return;
    const bounds = panel.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, event.clientX - dragOffset.current.x)),
      top: Math.max(8, Math.min(window.innerHeight - 52, event.clientY - dragOffset.current.y)),
    });
  };

  const stopDrag = () => { dragOffset.current = null; };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase is not configured.');
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Please sign in to contact customer support.');
      const response = await fetchSupabaseFunction('customer-service', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), category, priority: 'Normal', message: message.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to send your support request.');
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send your support request.');
    } finally {
      setSending(false);
    }
  };

  return <section
    className={`client-support-chat-widget${position ? ' is-positioned' : ''}${maximized ? ' is-maximized' : ''}${minimized ? ' is-minimized' : ''}`}
    ref={panel}
    style={position ? { left: position.left, top: position.top } : undefined}
    role="dialog"
    aria-label={`${text.support}: ${context}`}
    dir={language === 'ar' ? 'rtl' : 'ltr'}
  >
    <header className="client-support-chat-header" title={text.drag} onPointerDown={startDrag} onPointerMove={drag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <div className="client-support-chat-title">
        <strong>{context}</strong>
        <span>{text.support}</span>
      </div>
      <div className="client-support-chat-controls">
        <button type="button" aria-label={minimized ? text.maximize : text.minimize} title={minimized ? text.maximize : text.minimize} onClick={() => setMinimized((value) => !value)}>{minimized ? '+' : '−'}</button>
        <button type="button" aria-label={maximized ? text.minimize : text.maximize} title={maximized ? text.minimize : text.maximize} onClick={() => { setMinimized(false); setMaximized((value) => !value); }}>{maximized ? '❐' : '□'}</button>
        <button type="button" aria-label={text.close} title={text.close} onClick={onClose}>×</button>
      </div>
    </header>
    {!minimized && (sent
      ? <div className="client-support-chat-success" role="status">
        <strong>{text.sent}</strong>
        <p>{text.sentDetails}</p>
        <Link href="/client-dashboard/customer-service">{text.viewRequests}</Link>
      </div>
      : <form className="client-support-chat-form" onSubmit={(event) => void submit(event)}>
        <label>{text.subject}<input required minLength={3} maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label>{text.category}<select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="General Inquiry">{text.general}</option>
          <option value="Technical Support">{text.technical}</option>
        </select></label>
        <label>{text.message}<textarea required maxLength={5000} placeholder={text.messagePlaceholder} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        {error && <p className="client-support-chat-error" role="alert">{error}</p>}
        <button className="client-support-chat-submit" type="submit" disabled={sending}>{sending ? text.sending : text.send}</button>
      </form>)}
  </section>;
}
