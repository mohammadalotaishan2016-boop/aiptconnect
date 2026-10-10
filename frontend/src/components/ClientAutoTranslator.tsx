'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient } from '../lib/supabase/browser';
import type { DashboardLanguage } from './ClientDashboardLanguageSelector';

type TranslationState = { original: string; translated: string; language: DashboardLanguage };
type TranslationTarget = { source: string; apply: (value: string) => void };

const textStates = new WeakMap<Text, TranslationState>();
const attributeStates = new WeakMap<Element, Map<string, TranslationState>>();
const translationCache = new Map<string, string>();
const ignoredContent = 'script,style,noscript,svg,canvas,code,pre,iframe,video,audio,[data-no-translate]';

function readTextState(node: Text): TranslationState {
  const state = textStates.get(node);
  if (state && node.data === state.translated) return state;
  const next = { original: node.data, translated: node.data, language: 'en' as const };
  textStates.set(node, next);
  return next;
}

function readAttributeState(element: Element, name: string): TranslationState | null {
  const current = element.getAttribute(name);
  if (current === null) return null;
  const states = attributeStates.get(element) ?? new Map<string, TranslationState>();
  const state = states.get(name);
  if (state && current === state.translated) return state;
  const next = { original: current, translated: current, language: 'en' as const };
  states.set(name, next);
  attributeStates.set(element, states);
  return next;
}

function decodeGoogleText(value: string) {
  const decoder = document.createElement('textarea');
  decoder.innerHTML = value;
  return decoder.value;
}

function preserveWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function translatedLabel(language: DashboardLanguage) {
  return {
    ar: 'تعذرت ترجمة بعض محتويات الصفحة. يرجى المحاولة مرة أخرى لاحقاً.',
    en: 'Some page content could not be translated. Please try again later.',
    fil: 'Hindi maisalin ang ilang nilalaman ng pahina. Subukan muli mamaya.',
    zh: '部分页面内容无法翻译。请稍后重试。',
  }[language];
}

function retryLabel(language: DashboardLanguage) {
  return { ar: 'إعادة المحاولة', en: 'Retry translation', fil: 'Subukan muli ang pagsasalin', zh: '重试翻译' }[language];
}

export default function ClientAutoTranslator({ rootRef, language }: { rootRef: RefObject<HTMLElement | null>; language: DashboardLanguage }) {
  const generation = useRef(0);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const activeGeneration = ++generation.current;
    let active = true;
    let stoppedOnError = false;
    let scheduledScan = 0;
    setFailed(false);

    const eligible = (element: Element | null) => Boolean(element && !element.closest(ignoredContent));

    const scan = async () => {
      if (!active || stoppedOnError) return;
      const targets: TranslationTarget[] = [];
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);

      for (const node of nodes) {
        if (!eligible(node.parentElement)) continue;
        const state = readTextState(node);
        if (language === 'en') {
          if (node.data !== state.original) {
            node.data = state.original;
            state.translated = state.original;
            state.language = language;
          }
          continue;
        }
        if (state.language === language && node.data === state.translated) continue;
        const source = state.original.trim();
        if (!source) continue;
        if (source.length > 5000) throw new Error('A page text block is too long for translation.');
        targets.push({
          source,
          apply: value => {
            if (!node.isConnected || textStates.get(node) !== state) return;
            const translated = preserveWhitespace(state.original, decodeGoogleText(value));
            state.translated = translated;
            state.language = language;
            node.data = translated;
          },
        });
      }

      const elements = [root, ...Array.from(root.querySelectorAll('*'))];
      for (const element of elements) {
        if (!eligible(element)) continue;
        const translatableAttributes = ['aria-label', 'placeholder', 'title', 'alt'];
        if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) translatableAttributes.push('value');
        for (const name of translatableAttributes) {
          const state = readAttributeState(element, name);
          if (!state) continue;
          if (language === 'en') {
            if (element.getAttribute(name) !== state.original) {
              element.setAttribute(name, state.original);
              state.translated = state.original;
              state.language = language;
            }
            continue;
          }
          if (state.language === language && element.getAttribute(name) === state.translated) continue;
          const source = state.original.trim();
          if (!source) continue;
          if (source.length > 5000) throw new Error('A page label is too long for translation.');
          targets.push({
            source,
            apply: value => {
              if (!element.isConnected || attributeStates.get(element)?.get(name) !== state) return;
              const translated = preserveWhitespace(state.original, decodeGoogleText(value));
              state.translated = translated;
              state.language = language;
              element.setAttribute(name, translated);
            },
          });
        }
      }

      if (language === 'en' || !targets.length) return;
      const uniqueSources = [...new Set(targets.map(target => target.source))];
      const unresolved = uniqueSources.filter(source => !translationCache.has(`${language}\u0000${source}`));
      const translatedValues = new Map<string, string>();
      let offset = 0;
      while (offset < unresolved.length) {
        const texts: string[] = [];
        let batchLength = 0;
        while (offset < unresolved.length && texts.length < 80 && batchLength + unresolved[offset].length <= 30000) {
          const text = unresolved[offset++];
          texts.push(text);
          batchLength += text.length;
        }
        if (!texts.length) throw new Error('A page translation batch is too large.');
        const supabase = getSupabaseBrowserClient();
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session) throw new Error('An active client session is required for translation.');
        const response = await fetchSupabaseFunction('google-translate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: language, texts }),
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Translation request failed.';
          throw new Error(message);
        }
        if (!body || typeof body !== 'object' || !('translations' in body) || !Array.isArray(body.translations) || body.translations.length !== texts.length || body.translations.some(value => typeof value !== 'string')) {
          throw new Error('The translation service returned an invalid response.');
        }
        body.translations.forEach((value: string, index: number) => {
          const key = `${language}\u0000${texts[index]}`;
          if (translationCache.size >= 5000) translationCache.clear();
          translationCache.set(key, value);
          translatedValues.set(texts[index], value);
        });
      }

      if (!active || generation.current !== activeGeneration) return;
      targets.forEach(target => target.apply(translatedValues.get(target.source) ?? translationCache.get(`${language}\u0000${target.source}`) ?? target.source));
    };

    const runScan = () => {
      window.clearTimeout(scheduledScan);
      scheduledScan = window.setTimeout(() => {
        void scan().catch(cause => {
          if (!active || generation.current !== activeGeneration) return;
          stoppedOnError = true;
          console.error('Client page translation failed:', cause);
          setFailed(true);
        });
      }, 100);
    };

    const observer = new MutationObserver(runScan);
    observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'placeholder', 'title', 'alt'] });
    runScan();

    return () => {
      active = false;
      window.clearTimeout(scheduledScan);
      observer.disconnect();
    };
  }, [language, retry, rootRef]);

  return failed ? <p className="client-translation-warning" data-no-translate role="status"><span>{translatedLabel(language)}</span><button type="button" onClick={() => setRetry(value => value + 1)}>{retryLabel(language)}</button></p> : null;
}
