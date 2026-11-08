'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveSession } from './supabase/browser';

export type ArabicTranslationKind = 'name' | 'address';
export type ArabicTranslationStatus = 'idle' | 'pending' | 'loading' | 'error';
type Cache = Map<ArabicTranslationKind, Map<string, string>>;
const cache: Cache = new Map([['name', new Map()], ['address', new Map()]]);

export function useAutoArabic(text: string, kind: ArabicTranslationKind) {
  const [arabic, setArabic] = useState('');
  const [status, setStatus] = useState<ArabicTranslationStatus>('idle');
  const [manual, setManual] = useState(false);
  const manualRef = useRef(false);
  const sequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const currentText = text.trim();

  const onEdit = useCallback((value: string) => {
    if (!value.trim()) {
      manualRef.current = false;
      setManual(false);
      setArabic('');
      return;
    }
    manualRef.current = true;
    setManual(true);
    setArabic(value);
  }, []);

  const retranslate = useCallback(() => {
    manualRef.current = false;
    setManual(false);
    if (currentText) cache.get(kind)?.delete(currentText);
    sequence.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setArabic('');
    setStatus(currentText ? 'pending' : 'idle');
  }, [currentText, kind]);

  useEffect(() => {
    const ticket = ++sequence.current;
    requestController.current?.abort();
    requestController.current = null;
    if (manualRef.current) { setStatus('idle'); return; }
    if (!currentText) { setArabic(''); setStatus('idle'); return; }
    const cached = cache.get(kind)?.get(currentText);
    if (cached) { setArabic(cached); setStatus('idle'); return; }

    const controller = new AbortController();
    requestController.current = controller;
    setStatus('pending');
    const timer = window.setTimeout(() => {
      setStatus('loading');
      void (async () => {
        try {
          const session = await getActiveSession();
          if (!session?.access_token) throw new Error('unauthorized');
          const response = await fetch('/api/poa/translate', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: currentText, kind }),
            signal: controller.signal,
          });
          const body = await response.json().catch(() => ({})) as { arabic?: unknown };
          if (!response.ok || typeof body.arabic !== 'string') throw new Error('translation_failed');
          if (sequence.current !== ticket || manualRef.current) return;
          cache.get(kind)?.set(currentText, body.arabic);
          setArabic(body.arabic);
          setStatus('idle');
        } catch {
          if (!controller.signal.aborted && sequence.current === ticket) setStatus('error');
        }
      })();
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); if (requestController.current === controller) requestController.current = null; };
  }, [currentText, kind, manual]);

  return { arabic, status, onEdit, retranslate, manual };
}
