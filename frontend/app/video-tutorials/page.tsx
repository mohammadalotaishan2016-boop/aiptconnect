'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdministratorAccess } from '../../src/lib/admin-documents';
import { fetchSupabaseFunction } from '../../src/lib/supabase/browser';
import './video-tutorials.css';

type CardKey = 'quotations' | 'schedule-of-fees' | 'requirements' | 'statements' | 'poa' | 'projects' | 'notifications' | 'customer-service';
type Tutorial = { card_key: CardKey; title: string; s3_key: string; file_name: string; content_type: string; file_size: number; updated_at: string };
type ApiResult<T> = { data: T };

const cards: Array<{ key: CardKey; label: string }> = [
  { key: 'quotations', label: 'Quotations' },
  { key: 'schedule-of-fees', label: 'Schedule of Fees' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'statements', label: 'Statements' },
  { key: 'poa', label: 'POA' },
  { key: 'projects', label: 'Project' },
  { key: 'notifications', label: 'Notification' },
  { key: 'customer-service', label: 'Customer Service' },
];
const maxVideoSize = 1024 * 1024 * 1024;
const contentTypes: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchSupabaseFunction(`video-tutorials${path}`, { ...init, timeoutMs: 120000 });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(typeof body?.error === 'string' ? body.error : `Video tutorial request failed (HTTP ${response.status}).`);
  return body as T;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date) : '—';
}

function uploadVideo(path: string, token: string, file: File, contentType: string, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
    if (!supabase) return reject(Error('Supabase URL is not configured.'));
    const upload = new XMLHttpRequest();
    upload.open('PUT', `${supabase}/storage/v1/object/upload/sign/aipt-video-tutorials/${encodeURIComponent(path)}?token=${encodeURIComponent(token)}`);
    upload.setRequestHeader('Content-Type', contentType);
    upload.setRequestHeader('x-upsert', 'false');
    upload.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    upload.addEventListener('load', () => {
      if (upload.status >= 200 && upload.status < 300) resolve();
      else reject(Error(upload.responseText || `Supabase Storage upload failed (HTTP ${upload.status}). Check the project Storage file-size limit.`));
    });
    upload.addEventListener('error', () => reject(Error('Supabase Storage upload failed. Check your connection and the project Storage settings.')));
    upload.addEventListener('abort', () => reject(Error('Video upload was cancelled.')));
    upload.send(file);
  });
}

export default function VideoTutorialsPage() {
  const { access, accessError } = useAdministratorAccess();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(true);
  const [busyCard, setBusyCard] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request<ApiResult<Tutorial[]>>('?manage=true');
      setTutorials(result.data);
      setTitles(Object.fromEntries(result.data.map(item => [item.card_key, item.title])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load video tutorials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access === 'allowed') void load();
  }, [access, load]);

  const save = async (card: typeof cards[number]) => {
    if (busyCard) return;
    const current = tutorials.find(item => item.card_key === card.key);
    const file = files[card.key] ?? null;
    const title = (titles[card.key] || '').trim();
    if (!title) return setError(`Enter a tutorial title for ${card.label}.`);
    if (!current && !file) return setError(`Choose a video for ${card.label}.`);
    if (file && (file.size < 1 || file.size > maxVideoSize)) return setError('Choose a video file that is 1 GB or smaller.');
    const extension = file?.name.split('.').at(-1)?.toLowerCase() ?? '';
    const contentType = contentTypes[extension];
    if (file && !contentType) return setError('Upload an MP4, WebM, MOV, or M4V video.');

    setBusyCard(card.key);
    setUploadProgress(null);
    setUploadStatus(file ? 'Preparing upload...' : '');
    setError('');
    setNotice('');
    try {
      let result: ApiResult<Tutorial>;
      if (file && contentType) {
        const signed = await request<{ path: string; token: string; content_type: string }>('?action=upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_key: card.key, file_name: file.name, content_type: contentType, file_size: file.size }),
        });
        setUploadStatus('Uploading video...');
        setUploadProgress(0);
        await uploadVideo(signed.path, signed.token, file, signed.content_type, setUploadProgress);
        setUploadProgress(100);
        setUploadStatus('Video uploaded; saving tutorial...');
        result = await request<ApiResult<Tutorial>>('?action=assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_key: card.key, title, path: signed.path, file_name: file.name }),
        });
      } else {
        result = await request<ApiResult<Tutorial>>('', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_key: card.key, title }),
        });
      }
      setTutorials(currentItems => [...currentItems.filter(item => item.card_key !== card.key), result.data].sort((a, b) => a.card_key.localeCompare(b.card_key)));
      setFiles(currentFiles => ({ ...currentFiles, [card.key]: null }));
      setNotice(`${card.label} tutorial ${file ? (current ? 'replaced' : 'assigned') : 'updated'}.`);
      const input = document.getElementById(`video-${card.key}`) as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to save the ${card.label} tutorial.`);
    } finally {
      setBusyCard('');
      setUploadProgress(null);
      setUploadStatus('');
    }
  };

  const remove = async (card: typeof cards[number]) => {
    if (busyCard || !window.confirm(`Remove the ${card.label} tutorial and delete its video from storage?`)) return;
    setBusyCard(card.key);
    setError('');
    setNotice('');
    try {
      await request(`?card_key=${encodeURIComponent(card.key)}`, { method: 'DELETE' });
      setTutorials(current => current.filter(item => item.card_key !== card.key));
      setTitles(current => ({ ...current, [card.key]: '' }));
      setNotice(`${card.label} tutorial removed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to remove the ${card.label} tutorial.`);
    } finally {
      setBusyCard('');
    }
  };

  if (access !== 'allowed') {
    return accessError
      ? <main className="video-tutorials-page"><p className="video-tutorials-error" role="alert">{accessError}</p></main>
      : <main className="video-tutorials-page" aria-busy="true"><p>Verifying administrator access...</p></main>;
  }

  return <main className="video-tutorials-page">
    <header className="video-tutorials-heading"><div><p>CLIENT DASHBOARD</p><h1>Video Tutorials</h1></div><span>{tutorials.length} / {cards.length} assigned</span></header>
    {notice && <p className="video-tutorials-notice" role="status">{notice}</p>}
    {error && <p className="video-tutorials-error" role="alert">{error}</p>}
    <div className="video-tutorials-table-wrap">
      <table className="video-tutorials-table">
        <thead><tr><th scope="col">Dashboard card</th><th scope="col">Tutorial title</th><th scope="col">Video file</th><th scope="col">Assigned video</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={5} className="video-tutorials-empty">Loading tutorials...</td></tr>}
          {!loading && cards.map(card => {
            const tutorial = tutorials.find(item => item.card_key === card.key);
            const file = files[card.key] ?? null;
            return <tr key={card.key}>
              <th scope="row">{card.label}</th>
              <td><input aria-label={`${card.label} tutorial title`} value={titles[card.key] ?? ''} maxLength={200} placeholder="Tutorial title" onChange={event => setTitles(current => ({ ...current, [card.key]: event.target.value }))} /></td>
              <td><input id={`video-${card.key}`} type="file" accept="video/mp4,video/webm,video/quicktime,.m4v,.mov" aria-label={`${card.label} video upload`} onChange={event => {
                const next = event.target.files?.[0] ?? null;
                const ext = next?.name.split('.').at(-1)?.toLowerCase() ?? '';
                if (next && (!contentTypes[ext] || next.size < 1 || next.size > maxVideoSize)) {
                  setError('Upload an MP4, WebM, MOV, or M4V video up to 1 GB.');
                  event.target.value = '';
                  setFiles(current => ({ ...current, [card.key]: null }));
                  return;
                }
                setError('');
                setFiles(current => ({ ...current, [card.key]: next }));
                if (next && !titles[card.key]) setTitles(current => ({ ...current, [card.key]: next.name.replace(/\.[^.]+$/, '') }));
              }} /></td>
              <td>{tutorial ? <><span className="video-tutorials-current">{tutorial.file_name}</span><small>{formatSize(tutorial.file_size)} · {formatDate(tutorial.updated_at)}</small></> : <span className="video-tutorials-unassigned">Not assigned</span>}{file && <small>Selected: {file.name}</small>}</td>
              <td className="video-tutorials-actions"><button type="button" onClick={() => void save(card)} disabled={Boolean(busyCard)}>{busyCard === card.key ? (file ? 'Uploading...' : 'Saving...') : tutorial ? (file ? 'Replace' : 'Save') : 'Assign video'}</button>{tutorial && <button type="button" className="video-tutorials-remove" onClick={() => void remove(card)} disabled={Boolean(busyCard)} aria-label={`Delete ${card.label} tutorial`} title="Delete tutorial">Delete</button>}{busyCard === card.key && file && <div className="video-tutorials-upload-status" role="status" aria-live="polite"><span>{uploadStatus}{uploadProgress !== null && uploadStatus === 'Uploading video...' ? ` ${uploadProgress}%` : ''}</span><progress aria-label={`${card.label} video upload progress`} value={uploadProgress ?? undefined} max="100" /></div>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="video-tutorials-footnote">MP4, WebM, MOV, or M4V · Maximum 1 GB per video</p>
  </main>;
}
