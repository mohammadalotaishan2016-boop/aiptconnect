import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publicKey) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const supabase = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const configuredUrl = process.env.GOTENBERG_URL?.trim();
  if (!configuredUrl) return NextResponse.json({ error: 'pdf_conversion_unavailable' }, { status: 503 });
  let converterUrl: URL;
  try {
    converterUrl = new URL(configuredUrl);
    if (converterUrl.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(converterUrl.hostname))) {
      return NextResponse.json({ error: 'pdf_conversion_unavailable' }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: 'pdf_conversion_unavailable' }, { status: 503 });
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'invalid_document' }, { status: 400 }); }
  const source = form.get('file');
  if (!(source instanceof File) || !source.name.toLowerCase().endsWith('.docx') || source.size === 0 || source.size > MAX_DOCX_BYTES) {
    return NextResponse.json({ error: 'invalid_document' }, { status: 400 });
  }

  const converterForm = new FormData();
  converterForm.set('files', new File([await source.arrayBuffer()], 'poa.docx', { type: DOCX_TYPE }));
  converterForm.set('paperSize', 'A4');
  const timeout = AbortSignal.timeout(55_000);
  try {
    const response = await fetch(new URL('/forms/libreoffice/convert', converterUrl), {
      method: 'POST', body: converterForm, signal: timeout,
      headers: { 'Gotenberg-Output-Filename': 'poa' }, cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'pdf_conversion_failed' }, { status: 502 });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
      return NextResponse.json({ error: 'pdf_conversion_failed' }, { status: 502 });
    }
    return new Response(bytes, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="POA.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return NextResponse.json({ error: 'pdf_conversion_failed' }, { status: 502 });
  }
}
