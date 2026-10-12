'use client';

import { useId, useState } from 'react';
import type { ClassType } from '../../../backend/supabase/functions/_shared/quotation-class-pricing';

type Props = {
  selected: number[];
  onChange: (classes: number[]) => void;
  classType: ClassType | '';
  classCount: number;
  required?: boolean;
};

function ClassIcon({ name }: { name: 'settings' | 'chevron' | 'clear' | 'all' | 'info' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'settings' && <><path d="m9.4 3-.6 2.1-1.9 1.1-2.1-.5-2.2 3.8L4.2 11v2l-1.6 1.5 2.2 3.8 2.1-.5 1.9 1.1.6 2.1h4.4l.6-2.1 1.9-1.1 2.1.5 2.2-3.8L19 13v-2l1.6-1.5-2.2-3.8-2.1.5-1.9-1.1-.6-2.1Z" /><circle cx="11.6" cy="12" r="3.3" /></>}
    {name === 'chevron' && <path d="m7 10 5 5 5-5" />}
    {name === 'clear' && <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6M14 10v6" /></>}
    {name === 'all' && <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>}
    {name === 'info' && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7h.01" /></>}
  </svg>;
}

export default function TrademarkClassSelector({ selected, onChange, classType, classCount, required = false }: Props) {
  const id = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [showSelected, setShowSelected] = useState(false);
  const includedLimit = classType === 'Up to 5 classes' ? 5 : classType === 'Up to 3 classes' ? 3 : classType === 'Multi-class' ? 1 : 0;
  const included = Math.min(selected.length, includedLimit);
  const additional = Math.max(0, selected.length - includedLimit);
  const atSelectionLimit = required && selected.length >= classCount;
  const toggle = (number: number) => onChange(selected.includes(number) ? selected.filter(value => value !== number) : [...selected, number].sort((a, b) => a - b));

  return <section className="trademark-class-selector" aria-labelledby={id + '-title'}>
    <header className="tm-class-header">
      <span className="tm-class-icon"><ClassIcon name="settings" /></span>
      <div className="tm-class-heading">
        <h4 id={id + '-title'}>Trademark Classes <span>({required ? 'required' : 'optional'})</span></h4>
        <p>{required ? `Select exactly ${classCount} class ${classCount === 1 ? 'number' : 'numbers'} for your application.` : 'Select the trademark classes for your application.'}</p>
      </div>
      <div className={'tm-class-badge' + (classType ? '' : ' is-unset')}>
        <div><strong>{classType || 'Select a class type'}</strong><span>{classType ? '(Automatically applied)' : 'Choose a type in Fee Selection'}</span></div>
        <span title="The selected pricing type is applied automatically to your class count."><ClassIcon name="info" /></span>
      </div>
    </header>
    <div className={'tm-class-body' + (collapsed ? ' is-collapsed' : '')}>
      <div className="tm-class-picker">
        <div id={id + '-grid'} className="tm-class-grid" role="group" aria-label="Trademark classes 1 to 45" hidden={collapsed}>
          {Array.from({ length: 45 }, (_, index) => index + 1).map(number => <button key={number} type="button" className={'tm-class-button' + (selected.includes(number) ? ' is-selected' : '')} aria-label={'Class ' + number} aria-pressed={selected.includes(number)} disabled={atSelectionLimit && !selected.includes(number)} onClick={() => toggle(number)}>{String(number).padStart(2, '0')}</button>)}
        </div>
        {collapsed && <p className="tm-class-collapsed-note">Class grid collapsed. {selected.length} selected.</p>}
        <div className="tm-class-tools" role="group" aria-label="Class selection controls">
          <button type="button" aria-label={collapsed ? 'Expand class grid' : 'Collapse class grid'} title={collapsed ? 'Expand class grid' : 'Collapse class grid'} aria-expanded={!collapsed} aria-controls={id + '-grid'} onClick={() => setCollapsed(!collapsed)}><span className={collapsed ? '' : 'tm-chevron-up'}><ClassIcon name="chevron" /></span></button>
          <button type="button" aria-label="Clear selected classes" title="Clear selected classes" disabled={!selected.length} onClick={() => onChange([])}><ClassIcon name="clear" /></button>
          <button type="button" aria-label={required ? `Select first ${classCount} classes` : 'Select all 45 classes'} title={required ? `Select first ${classCount} classes` : 'Select all 45 classes'} disabled={required ? selected.length === classCount && selected.every((number, index) => number === index + 1) : selected.length === 45} onClick={() => onChange(Array.from({ length: required ? classCount : 45 }, (_, index) => index + 1))}><ClassIcon name="all" /></button>
        </div>
      </div>
      <aside className="tm-class-summary" aria-label="Class selection summary">
        <div aria-live="polite" aria-atomic="true">
          <h5>Selected Classes: {selected.length}{required ? ` / ${classCount}` : ''}</h5>
          {includedLimit > 0 ? <dl><div><dt>First class (Trademark)</dt><dd>{Math.min(1, selected.length)}</dd></div>{includedLimit > 1 && <div><dt>Additional classes 2 to {includedLimit}</dt><dd>{Math.max(0, included - 1)}</dd></div>}<div><dt>{includedLimit > 1 ? 'Classes after ' + includedLimit : 'Additional classes'}</dt><dd>{additional}</dd></div></dl> : <dl><div><dt>{classType ? 'Classes charged individually' : 'Selected class numbers'}</dt><dd>{selected.length}</dd></div></dl>}
        </div>
        <button className="tm-class-view" type="button" aria-expanded={showSelected} aria-controls={id + '-selected'} onClick={() => setShowSelected(!showSelected)}>{showSelected ? 'Hide selected classes' : 'View all classes'}<span className={showSelected ? 'tm-chevron-up' : ''}><ClassIcon name="chevron" /></span></button>
        {showSelected && <p className="tm-class-selected-list" id={id + '-selected'}>{selected.length ? selected.map(number => 'Class ' + number).join(', ') : 'No specific classes selected.'}</p>}
        {required && selected.length !== classCount && <p className="tm-class-empty">{selected.length ? `Select ${classCount - selected.length} more ${classCount - selected.length === 1 ? 'class number' : 'class numbers'}. ` : 'Select the required class numbers. '}Fees will use {classCount} {classCount === 1 ? 'class' : 'classes'}.</p>}
        {!required && !selected.length && <p className="tm-class-empty">Class numbers are optional. Pricing uses {classCount} {classCount === 1 ? 'class' : 'classes'}.</p>}
      </aside>
    </div>
  </section>;
}
