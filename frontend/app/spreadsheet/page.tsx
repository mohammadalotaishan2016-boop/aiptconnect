'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getSupabaseBrowserClient, fetchSupabaseFunction } from '../../src/lib/supabase/browser';

type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  background?: string;
};
type CellDataType = 'number' | 'string' | 'boolean' | 'date';

type Sheet = {
  id: string;
  name: string;
  cells: Record<string, string>;
  types: Record<string, CellDataType>;
  styles: Record<string, CellStyle>;
  widths: Record<number, number>;
};

type WorkbookState = { sheets: Sheet[] };
type History = { undo: WorkbookState[]; redo: WorkbookState[] };
type CellPosition = { row: number; column: number };

const ROW_COUNT = 100;
const COLUMN_COUNT = 26;
const DEFAULT_WIDTH = 112;

type ClientGroup = 'Chinese' | 'Non Chinese' | 'Direct';
const CLIENT_GROUPS: ClientGroup[] = ['Chinese', 'Non Chinese', 'Direct'];
const BASE_FEE_SHEETS = [
  'Trademark',
  'Patent',
  'Design',
  'Copyright',
  'Up to 3 classes',
  'Up to 5 classes',
  'Multi-classes',
];

function groupSheetName(base: string, group: ClientGroup): string {
  return `${base}(${group})`;
}

function sheetGroup(name: string): ClientGroup | null {
  for (const group of CLIENT_GROUPS) {
    if (name.endsWith(`(${group})`)) return group;
  }
  return null;
}

function allDefaultSheets(): { name: string; id: string }[] {
  const sheets: { name: string; id: string }[] = [];
  let index = 0;
  for (const group of CLIENT_GROUPS) {
    for (const base of BASE_FEE_SHEETS) {
      index++;
      sheets.push({ name: groupSheetName(base, group), id: `fee-sheet-${index}` });
    }
  }
  return sheets;
}

function createSheet(name = 'Sheet1', id = crypto.randomUUID()): Sheet {
  return { id, name, cells: {}, types: {}, styles: {}, widths: {} };
}

function createWorkbook(): WorkbookState {
  return { sheets: allDefaultSheets().map(({ name, id }) => createSheet(name, id)) };
}

function cloneWorkbook(workbook: WorkbookState): WorkbookState {
  return structuredClone(workbook);
}

/** Strip empty sheets and empty property bags before sending to Supabase.
 *  normalizeWorkbook() restores them on load, so no data is lost. */
function compactWorkbook(workbook: WorkbookState): WorkbookState {
  const sheets = workbook.sheets
    .filter((s) => Object.keys(s.cells).length > 0)
    .map((s) => {
      const compact: Record<string, unknown> = { id: s.id, name: s.name, cells: s.cells };
      if (Object.keys(s.types).length) compact.types = s.types;
      if (Object.keys(s.styles).length) compact.styles = s.styles;
      if (Object.keys(s.widths).length) compact.widths = s.widths;
      return compact as unknown as Sheet;
    });
  // Keep at least one sheet so the DB check constraint passes
  if (!sheets.length) {
    const first = workbook.sheets[0];
    return { sheets: [{ id: first.id, name: first.name, cells: {}, types: {}, styles: {}, widths: {} }] };
  }
  return { sheets };
}

function columnName(column: number): string {
  let result = '';
  while (column > 0) {
    const remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

function columnNumber(name: string): number {
  return [...name.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function cellAddress(row: number, column: number): string {
  return `${columnName(column)}${row}`;
}

function parseAddress(address: string): CellPosition | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(address.trim());
  return match ? { row: Number(match[2]), column: columnNumber(match[1]) } : null;
}

function inferCellType(value: string): CellDataType {
  if (value.trim() !== '' && Number.isFinite(Number(value)) && !/^[-+]?0\d/.test(value.trim())) return 'number';
  return 'string';
}

function normalizeWorkbook(value: unknown): WorkbookState | null {
  if (!value || typeof value !== 'object' || !('sheets' in value) || !Array.isArray(value.sheets) || value.sheets.length === 0) return null;
  const sheets: Sheet[] = [];
  for (const candidate of value.sheets) {
    if (!candidate || typeof candidate !== 'object') return null;
    const sheet = candidate as Partial<Sheet>;
    if (typeof sheet.id !== 'string' || typeof sheet.name !== 'string' || !sheet.name.trim()) return null;
    if (!sheet.cells || typeof sheet.cells !== 'object' || Array.isArray(sheet.cells)) return null;
    sheets.push({
      id: sheet.id,
      name: sheet.name,
      cells: sheet.cells,
      types: sheet.types && typeof sheet.types === 'object' ? sheet.types : {},
      styles: sheet.styles && typeof sheet.styles === 'object' ? sheet.styles : {},
      widths: sheet.widths && typeof sheet.widths === 'object' ? sheet.widths : {},
    });
  }
  // Migrate old 7-sheet workbooks: treat them as Chinese group, add empty Non Chinese + Direct
  const hasGroupSuffix = sheets.some((s) => sheetGroup(s.name) !== null);
  if (!hasGroupSuffix) {
    const migrated: Sheet[] = [];
    for (const sheet of sheets) {
      const base = BASE_FEE_SHEETS.find((b) => b.toLowerCase() === sheet.name.toLowerCase()) ?? sheet.name;
      migrated.push({ ...sheet, name: groupSheetName(base, 'Chinese') });
    }
    for (const group of CLIENT_GROUPS.slice(1)) {
      for (const base of BASE_FEE_SHEETS) {
        migrated.push(createSheet(groupSheetName(base, group)));
      }
    }
    return { sheets: migrated };
  }
  // Ensure every group has all 7 base sheets (fills missing groups after partial save)
  const existing = new Set(sheets.map((s) => s.name));
  const missing: Sheet[] = [];
  for (const group of CLIENT_GROUPS) {
    for (const base of BASE_FEE_SHEETS) {
      const name = groupSheetName(base, group);
      if (!existing.has(name)) missing.push(createSheet(name));
    }
  }
  if (missing.length) return { sheets: [...sheets, ...missing] };
  return { sheets };
}

function evaluateFormula(input: string, sheet: Sheet, resolving = new Set<string>()): number | string {
  const expression = input.slice(1).toUpperCase();
  const tokens = expression.match(/[A-Z]+\d+|(?:\d+(?:\.\d*)?|\.\d+)|[A-Z]+|[()+\-*/,:]/g) ?? [];
  const stripped = expression.replace(/\s/g, '');
  if (!tokens.length || tokens.join('') !== stripped) return '#ERROR!';
  let cursor = 0;

  const cellValue = (address: string): number => {
    if (resolving.has(address)) throw new Error('Circular reference');
    const raw = sheet.cells[address] ?? '';
    if (!raw) return 0;
    if (!raw.startsWith('=')) {
      const number = Number(raw);
      return Number.isFinite(number) ? number : 0;
    }
    resolving.add(address);
    const value = evaluateFormula(raw, sheet, resolving);
    resolving.delete(address);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid cell reference');
    return value;
  };

  const peek = () => tokens[cursor];
  const consume = (expected?: string) => {
    const token = tokens[cursor++];
    if (expected && token !== expected) throw new Error('Unexpected token');
    return token;
  };
  const parsePrimary = (): number => {
    const token = peek();
    if (token === '+' || token === '-') {
      consume();
      const value = parsePrimary();
      return token === '-' ? -value : value;
    }
    if (token === '(') {
      consume('(');
      const value = parseAdditive();
      consume(')');
      return value;
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token ?? '')) {
      consume();
      return Number(token);
    }
    if (/^[A-Z]+\d+$/.test(token ?? '')) {
      consume();
      return cellValue(token);
    }
    if (/^[A-Z]+$/.test(token ?? '')) {
      const functionName = consume();
      const RANGE_FUNCTIONS = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'];
      const SCALAR_FUNCTIONS = ['ABS', 'ROUND', 'INT', 'MOD', 'POWER', 'IF'];
      if (!RANGE_FUNCTIONS.includes(functionName) && !SCALAR_FUNCTIONS.includes(functionName)) throw new Error('Unsupported function');
      consume('(');
      if (SCALAR_FUNCTIONS.includes(functionName)) {
        const args: number[] = [];
        while (peek() !== ')') {
          args.push(parseAdditive());
          if (peek() !== ',') break;
          consume(',');
        }
        consume(')');
        if (functionName === 'ABS') { if (args.length !== 1) throw new Error('ABS needs 1 arg'); return Math.abs(args[0]); }
        if (functionName === 'INT') { if (args.length !== 1) throw new Error('INT needs 1 arg'); return Math.floor(args[0]); }
        if (functionName === 'ROUND') { if (args.length < 1 || args.length > 2) throw new Error('ROUND needs 1-2 args'); return Number(args[0].toFixed(args[1] ?? 0)); }
        if (functionName === 'MOD') { if (args.length !== 2 || args[1] === 0) throw new Error('MOD needs 2 args, divisor != 0'); return args[0] % args[1]; }
        if (functionName === 'POWER') { if (args.length !== 2) throw new Error('POWER needs 2 args'); return Math.pow(args[0], args[1]); }
        if (functionName === 'IF') { if (args.length !== 3) throw new Error('IF needs 3 args'); return args[0] !== 0 ? args[1] : args[2]; }
        throw new Error('Unsupported function');
      }
      const values: number[] = [];
      while (peek() !== ')') {
        const start = peek();
        if (!/^[A-Z]+\d+$/.test(start ?? '')) throw new Error('Invalid range');
        consume();
        if (peek() === ':') {
          consume(':');
          const end = consume();
          if (!/^[A-Z]+\d+$/.test(end)) throw new Error('Invalid range');
          const first = parseAddress(start);
          const last = parseAddress(end);
          if (!first || !last) throw new Error('Invalid range');
          for (let row = Math.min(first.row, last.row); row <= Math.max(first.row, last.row); row++) {
            for (let column = Math.min(first.column, last.column); column <= Math.max(first.column, last.column); column++) {
              values.push(cellValue(cellAddress(row, column)));
            }
          }
        } else {
          values.push(cellValue(start));
        }
        if (peek() !== ',') break;
        consume(',');
      }
      consume(')');
      if (functionName === 'SUM') return values.reduce((sum, v) => sum + v, 0);
      if (functionName === 'AVERAGE') { if (!values.length) throw new Error('Empty average'); return values.reduce((sum, v) => sum + v, 0) / values.length; }
      if (functionName === 'MIN') { if (!values.length) throw new Error('Empty MIN'); return Math.min(...values); }
      if (functionName === 'MAX') { if (!values.length) throw new Error('Empty MAX'); return Math.max(...values); }
      if (functionName === 'COUNT') return values.filter((v) => Number.isFinite(v) && v !== 0).length;
      throw new Error('Unsupported function');
    }
    throw new Error('Invalid formula');
  };
  const parseMultiplicative = (): number => {
    let value = parsePrimary();
    while (peek() === '*' || peek() === '/') {
      const operator = consume();
      const right = parsePrimary();
      if (operator === '/' && right === 0) throw new Error('Division by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const parseAdditive = (): number => {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  try {
    const result = parseAdditive();
    if (cursor !== tokens.length || !Number.isFinite(result)) return '#ERROR!';
    return result;
  } catch {
    return '#ERROR!';
  }
}

function getDisplayValue(value: string | undefined, sheet: Sheet, address: string): string {
  if (!value) return '';
  if (!value.startsWith('=')) return value;
  const result = evaluateFormula(value, sheet, new Set([address]));
  return typeof result === 'number' ? String(Number(result.toFixed(10))) : result;
}

function SpreadsheetToolbar({
  onUndo,
  onRedo,
  onImport,
  onExport,
  onSave,
  isSaving,
  canUndo,
  canRedo,
  search,
  setSearch,
}: {
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="spreadsheet-toolbar">
      <div className="sheet-toolbar-group">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo">↶ <span>Undo</span></button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo">↷ <span>Redo</span></button>
      </div>
      <div className="sheet-toolbar-group">
        <button type="button" onClick={onImport} title="Import the first Excel worksheet into the selected Fees Spreadsheet tab">⇧ <span>Import Excel</span></button>
        <button type="button" onClick={onExport}>⇩ <span>Export Excel</span></button>
      </div>
      <button className="sheet-primary-button" type="button" onClick={onSave} disabled={isSaving} aria-label={isSaving ? 'Saving workbook to database' : 'Update workbook in database'}>
        {isSaving ? '◌ ' : '✓ '}<span>{isSaving ? 'Saving…' : 'Update Database'}</span>
      </button>
      <label className="sheet-search">
        <span aria-hidden="true">⌕</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cells..." aria-label="Search cell contents" />
      </label>
    </div>
  );
}

function SpreadsheetGrid({
  sheet,
  selected,
  setSelected,
  editing,
  setEditing,
  editValue,
  setEditValue,
  commitEdit,
  search,
  widths,
  resizeColumn,
  gridRef,
  onKeyDown,
}: {
  sheet: Sheet;
  selected: CellPosition;
  setSelected: (position: CellPosition) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
  editValue: string;
  setEditValue: (value: string) => void;
  commitEdit: () => void;
  search: string;
  widths: Record<number, number>;
  resizeColumn: (column: number, event: React.PointerEvent<HTMLSpanElement>) => void;
  gridRef: React.RefObject<HTMLDivElement>;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const cellPositions = Object.keys(sheet.cells).map(parseAddress).filter((position): position is CellPosition => position !== null);
  const maxRow = cellPositions.reduce((maximum, position) => Math.max(maximum, position.row), 0);
  const maxColumn = cellPositions.reduce((maximum, position) => Math.max(maximum, position.column), 0);
  const rows = Array.from({ length: Math.max(ROW_COUNT, Math.min(1000, maxRow), Math.min(10000, selected.row + 10)) }, (_, index) => index + 1);
  const columns = Array.from({ length: Math.max(COLUMN_COUNT, Math.min(100, maxColumn), Math.min(256, selected.column + 5)) }, (_, index) => index + 1);
  const activeAddress = cellAddress(selected.row, selected.column);

  return (
    <div className="spreadsheet-grid-scroll" ref={gridRef} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-label={`${sheet.name} spreadsheet`}>
      <table className="spreadsheet-grid">
        <colgroup>
          <col className="sheet-row-number-column" />
          {columns.map((column) => <col key={column} style={{ width: `${widths[column] ?? sheet.widths[column] ?? DEFAULT_WIDTH}px` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="sheet-corner" aria-hidden="true" />
            {columns.map((column) => (
              <th key={column} className={selected.column === column ? 'is-active' : ''}>
                {columnName(column)}
                <span className="column-resize-handle" onPointerDown={(event) => resizeColumn(column, event)} role="separator" aria-label={`Resize column ${columnName(column)}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th className={selected.row === row ? 'is-active' : ''} scope="row">{row}</th>
              {columns.map((column) => {
                const address = cellAddress(row, column);
                const active = activeAddress === address;
                const rawValue = sheet.cells[address] ?? '';
                const style = sheet.styles[address] ?? {};
                const matched = Boolean(search && rawValue.toLowerCase().includes(search.toLowerCase()));
                const cellStyle: CSSProperties = {
                  fontWeight: style.bold ? 700 : 400,
                  fontStyle: style.italic ? 'italic' : 'normal',
                  textAlign: style.align ?? 'left',
                  color: style.color,
                  backgroundColor: style.background,
                };
                return (
                  <td key={address} data-address={address} className={`${active ? 'is-selected' : ''}${matched ? ' is-search-match' : ''}`} onClick={() => { setSelected({ row, column }); gridRef.current?.focus(); }} onDoubleClick={() => { setSelected({ row, column }); setEditValue(rawValue); setEditing(true); }}>
                    {active && editing ? (
                      <input autoFocus value={editValue} aria-label={`Edit ${address}`} onChange={(event) => setEditValue(event.target.value)} onBlur={commitEdit} />
                    ) : <span style={cellStyle}>{getDisplayValue(rawValue, sheet, address)}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorksheetTabs({
  sheets,
  activeId,
  setActiveId,
  renameSheet,
  deleteSheet,
  onAddSheet,
  renameError,
}: {
  sheets: Sheet[];
  activeId: string;
  setActiveId: (id: string) => void;
  renameSheet: (sheet: Sheet, name: string) => boolean;
  deleteSheet: (sheet: Sheet) => void;
  onAddSheet: () => void;
  renameError: string;
}) {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState('');
  const finishRename = (sheet: Sheet) => {
    if (renameSheet(sheet, draft)) setEditingId('');
  };

  return (
    <>
      <div className="worksheet-tabs" role="tablist" aria-label="Worksheets">
        {sheets.map((sheet) => (
          <div className={`worksheet-tab${sheet.id === activeId ? ' is-active' : ''}`} key={sheet.id}>
            {editingId === sheet.id ? (
              <input autoFocus aria-label={`Rename ${sheet.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finishRename(sheet)} onKeyDown={(event) => {
                if (event.key === 'Enter') finishRename(sheet);
                if (event.key === 'Escape') setEditingId('');
              }} />
            ) : <button type="button" role="tab" aria-selected={sheet.id === activeId} onClick={() => setActiveId(sheet.id)} onDoubleClick={() => { setDraft(sheet.name); setEditingId(sheet.id); }} title="Double-click to rename">{sheet.name}</button>}
            {sheets.length > 1 && <button type="button" className="sheet-tab-delete" onClick={() => deleteSheet(sheet)} aria-label={`Delete ${sheet.name}`}>×</button>}
          </div>
        ))}
        <button type="button" className="worksheet-tab-add" onClick={onAddSheet} title="Add new sheet">＋</button>
      </div>
      {renameError && <span className="spreadsheet-inline-error" role="alert">{renameError}</span>}
    </>
  );
}

function AdminDeleteSheetModal({
  sheetName,
  password,
  setPassword,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  sheetName: string;
  password: string;
  setPassword: (password: string) => void;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="spreadsheet-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="spreadsheet-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-sheet-title">
        <h2 id="delete-sheet-title">Administrator verification required</h2>
        <p>Enter your administrator password to delete the “{sheetName}” worksheet. This cannot be undone.</p>
        <form onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <label htmlFor="delete-sheet-password">Administrator password</label>
          <input
            id="delete-sheet-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
            disabled={busy}
          />
          {error && <p className="spreadsheet-delete-error" role="alert">{error}</p>}
          <div className="spreadsheet-delete-actions">
            <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="submit" className="spreadsheet-delete-confirm" disabled={busy || !password}>
              {busy ? 'Verifying…' : 'Verify and delete'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}


/* ── Pricing Sheet (structured fee table, 3 client types × 7 items) ── */

type PricingClientType = 'chinese' | 'non_chinese' | 'direct';
const PRICING_CLIENT_TYPES: PricingClientType[] = ['chinese', 'non_chinese', 'direct'];
const PRICING_TYPE_LABELS: Record<PricingClientType, string> = { chinese: 'Chinese', non_chinese: 'Non Chinese', direct: 'Direct' };
const PRICING_ITEM_KEYS = ['trademark', 'patent', 'design', 'copyright', 'up_to_3_classes', 'up_to_5_classes', 'multi_classes'] as const;
const PRICING_ITEM_LABELS: Record<string, string> = {
  trademark: 'Trademark', patent: 'Patent', design: 'Design', copyright: 'Copyright',
  up_to_3_classes: 'Up to 3 classes', up_to_5_classes: 'Up to 5 classes', multi_classes: 'Multi-classes',
};

interface PricingRow {
  id: string;
  client_type: PricingClientType;
  item_key: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency: string;
}

function PricingSheet() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [activeTab, setActiveTab] = useState<PricingClientType>('chinese');
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    try {
      const response = await fetchSupabaseFunction('pricing-sheet');
      if (!response.ok) throw new Error('Failed to load pricing data.');
      const data: PricingRow[] = await response.json();
      setRows(data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load pricing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const tabRows = useMemo(
    () => rows.filter((r) => r.client_type === activeTab).sort((a, b) => PRICING_ITEM_KEYS.indexOf(a.item_key as typeof PRICING_ITEM_KEYS[number]) - PRICING_ITEM_KEYS.indexOf(b.item_key as typeof PRICING_ITEM_KEYS[number])),
    [rows, activeTab],
  );

  const updateField = (id: string, field: 'official_fee' | 'attorney_fee', raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      updated.total_fee = Math.round((updated.official_fee + updated.attorney_fee) * 100) / 100;
      return updated;
    }));
    setDirty((prev) => new Set(prev).add(id));
  };

  const save = async () => {
    if (!dirty.size) return;
    setSaving(true);
    setError('');
    try {
      const dirtyRows = rows.filter((r) => dirty.has(r.id)).map(({ id, official_fee, attorney_fee, total_fee }) => ({ id, official_fee, attorney_fee, total_fee }));
      const response = await fetchSupabaseFunction('pricing-sheet?batch=true', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: dirtyRows }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Save failed.');
      }
      setDirty(new Set());
      setNotification('Pricing saved successfully.');
      setTimeout(() => setNotification(''), 3000);
      void loadRows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="pricing-sheet-section"><p>Loading pricing data…</p></section>;

  return (
    <section className="pricing-sheet-section">
      <div className="pricing-sheet-header">
        <div>
          <h2>Official &amp; Attorney Fees</h2>
          <p>Structured fee schedule grouped by client type</p>
        </div>
        <div className="pricing-sheet-actions">
          <button type="button" className="pricing-sheet-save" onClick={() => void save()} disabled={!dirty.size || saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
      {notification && <div className="pricing-sheet-notification" role="status">{notification}</div>}
      {error && <div className="pricing-sheet-error" role="alert">{error}</div>}
      <div className="pricing-sheet-tabs" role="tablist" aria-label="Client type tabs">
        {PRICING_CLIENT_TYPES.map((ct) => (
          <button key={ct} type="button" role="tab" aria-selected={ct === activeTab} className={ct === activeTab ? 'is-active' : ''} onClick={() => setActiveTab(ct)}>
            {PRICING_TYPE_LABELS[ct]}
          </button>
        ))}
      </div>
      <table className="pricing-sheet-table">
        <thead>
          <tr><th>Item</th><th>Official Fee</th><th>Attorney Fee</th><th>Total Fee</th></tr>
        </thead>
        <tbody>
          {tabRows.map((row) => (
            <tr key={row.id}>
              <td className="pricing-item-label">{PRICING_ITEM_LABELS[row.item_key] ?? row.item_key}</td>
              <td><input type="text" inputMode="decimal" value={row.official_fee} onChange={(e) => updateField(row.id, 'official_fee', e.target.value)} aria-label={`${PRICING_ITEM_LABELS[row.item_key]} official fee`} /></td>
              <td><input type="text" inputMode="decimal" value={row.attorney_fee} onChange={(e) => updateField(row.id, 'attorney_fee', e.target.value)} aria-label={`${PRICING_ITEM_LABELS[row.item_key]} attorney fee`} /></td>
              <td className="pricing-total-cell">{row.total_fee.toFixed(2)}</td>
            </tr>
          ))}
          {tabRows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#728399', padding: '16px' }}>No pricing data for this client type.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export default function SpreadsheetPage() {
  const [workbook, setWorkbook] = useState<WorkbookState>(createWorkbook);
  const [activeGroup, setActiveGroup] = useState<ClientGroup>('Chinese');
  const [activeId, setActiveId] = useState(() => workbook.sheets[0]?.id ?? '');
  const [databaseStatus, setDatabaseStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [saveNotification, setSaveNotification] = useState('');
  const [sheetPendingDelete, setSheetPendingDelete] = useState<Sheet | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [renameError, setRenameError] = useState('');
  const [selected, setSelected] = useState<CellPosition>({ row: 1, column: 1 });
  const [addressDraft, setAddressDraft] = useState('A1');
  const [history, setHistory] = useState<History>({ undo: [], redo: [] });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [formulaDraft, setFormulaDraft] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [widths, setWidths] = useState<Record<number, number>>({});
  const [clipboard, setClipboard] = useState<{ value: string; address: string; cut: boolean } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef<number | null>(null);
  const lastSavedRef = useRef('');
  const workbookRef = useRef(workbook);
  const pendingSaveRef = useRef<{ workbook: WorkbookState; serialized: string; manual: boolean } | null>(null);
  const savingRef = useRef(false);
  const handledSaveAttemptRef = useRef(0);
  const saveImmediatelyRef = useRef(false);
  workbookRef.current = workbook;
  const groupSheets = useMemo(() => workbook.sheets.filter((s) => s.name.endsWith(`(${activeGroup})`)), [workbook.sheets, activeGroup]);
  const activeSheet = workbook.sheets.find((sheet) => sheet.id === activeId) ?? groupSheets[0] ?? workbook.sheets[0];
  const selectedAddress = cellAddress(selected.row, selected.column);
  const isSaveTimeout = saveError.toLowerCase().includes('upstream request timeout');

  useEffect(() => {
    let cancelled = false;
    setDatabaseStatus('loading');
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase is not configured. Configure the browser Supabase URL and publishable key.');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Could not verify the administrator session: ${authError.message}`);
      if (!user) throw new Error('Sign in with an administrator account to open the shared workbook.');
      const { data, error } = await supabase.from('spreadsheet_workbooks').select('workbook, revision').eq('id', true).single();
      if (error) throw new Error(`Could not load the shared workbook: ${error.message}`);
      const sharedWorkbook = normalizeWorkbook(data.workbook);
      if (!sharedWorkbook) throw new Error('The shared workbook data is invalid. Contact your system administrator.');
      const revision = Number(data.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('The shared workbook revision is invalid. Contact your system administrator.');
      if (cancelled) return;
      revisionRef.current = revision;
      lastSavedRef.current = JSON.stringify(sharedWorkbook);
      setWorkbook(sharedWorkbook);
      setActiveId(sharedWorkbook.sheets[0].id);
      setDatabaseStatus('ready');
      setSaveStatus('saved');
      setSaveError('');
    };
    void load().catch((error: unknown) => {
      if (cancelled) return;
      console.error('Shared spreadsheet load failed.', error);
      setSaveError(error instanceof Error ? error.message : 'Unable to load the shared workbook.');
      setDatabaseStatus('error');
    });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    if (databaseStatus !== 'ready') return;
    const serialized = JSON.stringify(workbook);
    const manualSave = saveAttempt > handledSaveAttemptRef.current;
    if (manualSave) handledSaveAttemptRef.current = saveAttempt;
    if (serialized === lastSavedRef.current && !manualSave) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      pendingSaveRef.current = { workbook: cloneWorkbook(workbook), serialized, manual: manualSave };
      saveImmediatelyRef.current = false;
      if (savingRef.current) return;
      savingRef.current = true;
      const savePending = async () => {
        try {
          while (pendingSaveRef.current) {
            const pending = pendingSaveRef.current;
            pendingSaveRef.current = null;
            const supabase = getSupabaseBrowserClient();
            if (!supabase || revisionRef.current === null) throw new Error('Supabase is not connected. The workbook was not saved.');
            const { data, error } = await supabase.rpc('save_shared_spreadsheet', {
              p_workbook: compactWorkbook(pending.workbook),
              p_expected_revision: revisionRef.current,
            });
            if (error) throw new Error(error.message);
            const revision = Number(data);
            if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Supabase returned an invalid workbook revision.');
            const savedNewVersion = revision > revisionRef.current;
            revisionRef.current = revision;
            lastSavedRef.current = pending.serialized;
            // Materialize fees in background after workbook revision change (one sheet per request to stay within edge compute limits)
            if (savedNewVersion) {
              const session = (await supabase.auth.getSession()).data.session;
              if (session) {
                const sheetCount = pending.workbook?.sheets?.length ?? 0;
                for (let i = 0; i < sheetCount; i++) {
                  fetchSupabaseFunction(`quotations?action=materialize&sheet=${i}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                  }).catch(() => { /* non-blocking */ });
                }
              }
            }
            if (JSON.stringify(workbookRef.current) === pending.serialized) {
              setSaveStatus('saved');
              setSaveError('');
              if (pending.manual) setSaveNotification(savedNewVersion ? 'Workbook updated in the database.' : 'The database is already up to date.');
              else if (savedNewVersion) setSaveNotification('Workbook saved to Supabase.');
            }
          }
        } catch (error) {
          pendingSaveRef.current = null;
          console.error('Shared spreadsheet autosave failed.', error);
          setSaveStatus('error');
          setSaveError(error instanceof Error ? error.message : 'The workbook could not be saved.');
        } finally {
          savingRef.current = false;
        }
      };
      void savePending();
    }, saveImmediatelyRef.current ? 0 : 2000);
    return () => window.clearTimeout(timer);
  }, [databaseStatus, saveAttempt, workbook]);

  useEffect(() => {
    if (!saveNotification) return;
    const timer = window.setTimeout(() => setSaveNotification(''), 3500);
    return () => window.clearTimeout(timer);
  }, [saveNotification]);

  useEffect(() => {
    setFormulaDraft(activeSheet?.cells[selectedAddress] ?? '');
  }, [activeSheet, selectedAddress]);

  useEffect(() => {
    setAddressDraft(selectedAddress);
  }, [selectedAddress]);

  useEffect(() => {
    gridRef.current?.querySelector(`[data-address="${selectedAddress}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedAddress]);

  const changeWorkbook = useCallback((update: (current: WorkbookState) => WorkbookState) => {
    const next = update(workbook);
    if (next === workbook) return;
    setHistory((previous) => ({ undo: [...previous.undo.slice(-49), cloneWorkbook(workbook)], redo: [] }));
    setWorkbook(next);
    setMessage('');
  }, [workbook]);

  const commitCells = useCallback((updates: Array<[string, string]>) => {
    changeWorkbook((current) => {
      const sheet = current.sheets.find((item) => item.id === activeId);
      if (!sheet || updates.every(([address, value]) => (sheet.cells[address] ?? '') === value)) return current;
      const cells = { ...sheet.cells };
      const types = { ...sheet.types };
      updates.forEach(([address, value]) => {
        if (value === '') delete cells[address];
        else cells[address] = value;
        if (value === '' || value.startsWith('=')) delete types[address];
        else types[address] = inferCellType(value);
      });
      return { ...current, sheets: current.sheets.map((item) => item.id === activeId ? { ...item, cells, types } : item) };
    });
    setEditing(false);
    const selectedValue = updates.find(([address]) => address === selectedAddress)?.[1];
    if (selectedValue !== undefined) setFormulaDraft(selectedValue);
  }, [activeId, changeWorkbook, selectedAddress]);

  const commitCell = useCallback((address: string, value: string) => {
    commitCells([[address, value]]);
  }, [commitCells]);

  const moveSelection = (rowDelta: number, columnDelta: number) => {
    setSelected((current) => {
      const next = { row: Math.max(1, current.row + rowDelta), column: Math.max(1, current.column + columnDelta) };
      requestAnimationFrame(() => gridRef.current?.querySelector(`[data-address="${cellAddress(next.row, next.column)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      return next;
    });
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (event.ctrlKey || event.metaKey) {
      if (key.toLowerCase() === 'c' || key.toLowerCase() === 'x') {
        event.preventDefault();
        const value = activeSheet.cells[selectedAddress] ?? '';
        setClipboard({ value, address: selectedAddress, cut: key.toLowerCase() === 'x' });
        void navigator.clipboard?.writeText(value).catch((error: unknown) => console.warn('Clipboard access was unavailable.', error));
      } else if (key.toLowerCase() === 'v') {
        event.preventDefault();
        const pasteValue = (value: string) => {
          if (clipboard?.cut && clipboard.address !== selectedAddress) {
            commitCells([[selectedAddress, value], [clipboard.address, '']]);
          } else {
            commitCell(selectedAddress, value);
          }
          setClipboard(null);
        };
        if (clipboard) pasteValue(clipboard.value);
        else void navigator.clipboard?.readText().then(pasteValue).catch((error: unknown) => setMessage(`Could not read clipboard: ${String(error)}`));
      } else if (key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      return;
    }
    if (editing) {
      if (key === 'Enter' || key === 'Tab') {
        event.preventDefault();
        commitCell(selectedAddress, editValue);
        moveSelection(key === 'Enter' ? 1 : 0, key === 'Tab' ? 1 : 0);
      } else if (key === 'Escape') {
        event.preventDefault();
        setEditing(false);
      }
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0, key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0);
    } else if (key === 'Enter') {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (key === 'Tab') {
      event.preventDefault();
      moveSelection(0, event.shiftKey ? -1 : 1);
    } else if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      commitCell(selectedAddress, '');
    } else if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      setEditValue(key);
      setEditing(true);
    }
  };

  const undo = () => setHistory((current) => {
    const previous = current.undo.at(-1);
    if (!previous) return current;
    setWorkbook(cloneWorkbook(previous));
    return { undo: current.undo.slice(0, -1), redo: [...current.redo, cloneWorkbook(workbook)] };
  });
  const redo = () => setHistory((current) => {
    const next = current.redo.at(-1);
    if (!next) return current;
    setWorkbook(cloneWorkbook(next));
    return { undo: [...current.undo, cloneWorkbook(workbook)], redo: current.redo.slice(0, -1) };
  });

  const renameSheet = (sheet: Sheet, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 31 || /[\\/?*:[\]]/.test(trimmed) || workbook.sheets.some((item) => item.id !== sheet.id && item.name.toLowerCase() === trimmed.toLowerCase())) {
      setRenameError('Worksheet name must be unique, 1–31 characters, and cannot contain : \\ / ? * [ ]');
      return false;
    }
    setRenameError('');
    changeWorkbook((current) => ({ ...current, sheets: current.sheets.map((item) => item.id === sheet.id ? { ...item, name: trimmed } : item) }));
    return true;
  };

  const addSheet = useCallback(() => {
    const groupPrefix = `Sheet(${activeGroup})`;
    const existing = workbook.sheets.filter((s) => s.name.startsWith('Sheet') && s.name.endsWith(`(${activeGroup})`));
    let n = existing.length + 1;
    let name = `${groupPrefix}`;
    while (workbook.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      n++;
      name = `Sheet${n}(${activeGroup})`;
    }
    const newSheet = createSheet(name);
    changeWorkbook((current) => ({ ...current, sheets: [...current.sheets, newSheet] }));
    setActiveId(newSheet.id);
    setSelected({ row: 1, column: 1 });
    setWidths({});
  }, [activeGroup, workbook, changeWorkbook]);

  const requestDeleteSheet = (sheet: Sheet) => {
    if (workbook.sheets.length < 2) return;
    setDeletePassword('');
    setDeleteError('');
    setSheetPendingDelete(sheet);
  };

  const confirmDeleteSheet = async () => {
    if (!sheetPendingDelete || deleteBusy || !deletePassword) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(`Could not verify the current session: ${userError.message}`);
      if (!user?.email) throw new Error('Sign in with your administrator account again before deleting a worksheet.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, account_status')
        .eq('id', user.id)
        .single();
      if (profileError) throw new Error(`Could not verify administrator access: ${profileError.message}`);
      if (profile.role !== 'administrator' || profile.account_status !== 'active') {
        throw new Error('Only an active administrator can delete a worksheet.');
      }

      const { data: reauthenticated, error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (authError) throw new Error('The administrator password is incorrect. No worksheet was deleted.');
      if (reauthenticated.user?.id !== user.id) throw new Error('Administrator verification failed. Sign in again and retry.');

      const { data: confirmedProfile, error: confirmedProfileError } = await supabase
        .from('profiles')
        .select('role, account_status')
        .eq('id', user.id)
        .single();
      if (confirmedProfileError) throw new Error(`Could not recheck administrator access: ${confirmedProfileError.message}`);
      if (confirmedProfile.role !== 'administrator' || confirmedProfile.account_status !== 'active') {
        throw new Error('Active administrator access is required to delete a worksheet.');
      }

      const currentWorkbook = workbookRef.current;
      const targetExists = currentWorkbook.sheets.some((sheet) => sheet.id === sheetPendingDelete.id);
      if (!targetExists || currentWorkbook.sheets.length < 2) {
        setSheetPendingDelete(null);
        return;
      }
      const remaining = currentWorkbook.sheets.filter((sheet) => sheet.id !== sheetPendingDelete.id);
      changeWorkbook((current) => ({ ...current, sheets: current.sheets.filter((sheet) => sheet.id !== sheetPendingDelete.id) }));
      if (activeId === sheetPendingDelete.id) setActiveId(remaining[0].id);
      setSheetPendingDelete(null);
      setDeletePassword('');
      setMessage(`Deleted worksheet "${sheetPendingDelete.name}"`);
    } catch (error) {
      console.error('Administrator worksheet deletion verification failed.', error);
      setDeleteError(error instanceof Error ? error.message : 'Administrator verification failed. No worksheet was deleted.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const updateDatabase = () => {
    if (saveStatus === 'saving' || savingRef.current) return;
    if (JSON.stringify(workbook) === lastSavedRef.current) {
      setSaveNotification('The database is already up to date.');
      return;
    }
    saveImmediatelyRef.current = true;
    setSaveAttempt((attempt) => attempt + 1);
  };

  const setCellStyle = (key: keyof CellStyle, value: CellStyle[keyof CellStyle]) => {
    changeWorkbook((current) => ({
      ...current,
      sheets: current.sheets.map((sheet) => {
        if (sheet.id !== activeId) return sheet;
        const style = { ...sheet.styles[selectedAddress] };
        if (key === 'bold' || key === 'italic') style[key] = !style[key];
        else if (key === 'align') style.align = value as CellStyle['align'];
        else if (key === 'color') style.color = value as string;
        else if (key === 'background') style.background = value as string;
        return { ...sheet, styles: { ...sheet.styles, [selectedAddress]: style } };
      }),
    }));
  };

  const insertDelete = (axis: 'row' | 'column', action: 'insert' | 'delete') => {
    const pivot = axis === 'row' ? selected.row : selected.column;
    changeWorkbook((current) => ({
      ...current,
      sheets: current.sheets.map((sheet) => {
        if (sheet.id !== activeId) return sheet;
        const cells: Sheet['cells'] = {};
        const types: Sheet['types'] = {};
        const styles: Sheet['styles'] = {};
        for (const [address, value] of Object.entries(sheet.cells)) {
          const position = parseAddress(address);
          if (!position) continue;
          const coordinate = axis === 'row' ? position.row : position.column;
          if (action === 'delete' && coordinate === pivot) continue;
          const shifted = action === 'insert' && coordinate >= pivot ? coordinate + 1 : action === 'delete' && coordinate > pivot ? coordinate - 1 : coordinate;
          const nextAddress = axis === 'row' ? cellAddress(shifted, position.column) : cellAddress(position.row, shifted);
          cells[nextAddress] = value;
          if (sheet.types[address]) types[nextAddress] = sheet.types[address];
        }
        for (const [address, style] of Object.entries(sheet.styles)) {
          const position = parseAddress(address);
          if (!position) continue;
          const coordinate = axis === 'row' ? position.row : position.column;
          if (action === 'delete' && coordinate === pivot) continue;
          const shifted = action === 'insert' && coordinate >= pivot ? coordinate + 1 : action === 'delete' && coordinate > pivot ? coordinate - 1 : coordinate;
          const nextAddress = axis === 'row' ? cellAddress(shifted, position.column) : cellAddress(position.row, shifted);
          styles[nextAddress] = style;
        }
        const widths = { ...sheet.widths };
        if (axis === 'column') {
          if (action === 'delete') delete widths[pivot];
          const shiftedWidths: Sheet['widths'] = {};
          for (const [column, width] of Object.entries(widths)) {
            const number = Number(column);
            const shifted = action === 'insert' && number >= pivot ? number + 1 : action === 'delete' && number > pivot ? number - 1 : number;
            shiftedWidths[shifted] = width;
          }
          return { ...sheet, cells, types, styles, widths: shiftedWidths };
        }
        return { ...sheet, cells, types, styles };
      }),
    }));
  };

  const resizeColumn = (column: number, event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widths[column] ?? activeSheet.widths[column] ?? DEFAULT_WIDTH;
    const move = (pointerEvent: PointerEvent) => setWidths((current) => ({ ...current, [column]: Math.max(48, startWidth + pointerEvent.clientX - startX) }));
    const stop = (pointerEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      const width = Math.max(48, startWidth + pointerEvent.clientX - startX);
      changeWorkbook((current) => ({ ...current, sheets: current.sheets.map((sheet) => sheet.id === activeId ? { ...sheet, widths: { ...sheet.widths, [column]: width } } : sheet) }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const importWorkbook = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const imported = new ExcelJS.Workbook();
      await imported.xlsx.load(await file.arrayBuffer());
      if (!imported.worksheets.length) throw new Error('The file does not contain any worksheets.');
      const sourceWorksheet = imported.worksheets[0];
      const currentSheet = workbookRef.current.sheets.find((sheet) => sheet.id === activeId);
      if (!currentSheet) throw new Error('Select a Fees Spreadsheet tab before importing.');
      const importedSheet = createSheet(currentSheet.name, currentSheet.id);
      sourceWorksheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const address = cell.address.toUpperCase();
          const value = cell.value;
          if (value && typeof value === 'object' && 'formula' in value) {
            importedSheet.cells[address] = `=${value.formula}`;
          } else if (value && typeof value === 'object' && 'richText' in value) {
            importedSheet.cells[address] = value.richText.map((part) => part.text).join('');
            importedSheet.types[address] = 'string';
          } else if (value && typeof value === 'object' && 'text' in value) {
            importedSheet.cells[address] = value.text;
            importedSheet.types[address] = 'string';
          } else if (value instanceof Date) {
            importedSheet.cells[address] = value.toISOString().slice(0, 10);
            importedSheet.types[address] = 'date';
          } else if (value !== null && value !== undefined) {
            importedSheet.cells[address] = String(value);
            importedSheet.types[address] = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
          }
          const style: CellStyle = {};
          if (cell.font?.bold) style.bold = true;
          if (cell.font?.italic) style.italic = true;
          if (cell.font?.color?.argb) style.color = `#${cell.font.color.argb.slice(-6)}`;
          if (cell.fill && 'fgColor' in cell.fill && cell.fill.fgColor?.argb) style.background = `#${cell.fill.fgColor.argb.slice(-6)}`;
          if (cell.alignment?.horizontal === 'left' || cell.alignment?.horizontal === 'center' || cell.alignment?.horizontal === 'right') style.align = cell.alignment.horizontal;
          if (Object.keys(style).length) importedSheet.styles[address] = style;
        });
      });
      sourceWorksheet.columns.forEach((column, index) => {
        if (column.width) importedSheet.widths[index + 1] = Math.max(48, Math.round(column.width * 7));
      });
      changeWorkbook((current) => ({
        ...current,
        sheets: current.sheets.map((sheet) => sheet.id === activeId ? importedSheet : sheet),
      }));
      setSelected({ row: 1, column: 1 });
      setWidths({});
      setMessage(`Imported "${sourceWorksheet.name}" into the existing "${currentSheet.name}" tab. No worksheet tabs were added.${imported.worksheets.length > 1 ? ` Ignored ${imported.worksheets.length - 1} additional worksheet${imported.worksheets.length === 2 ? '' : 's'}.` : ''}`);
    } catch (error) {
      console.error('Excel import failed.', error);
      setMessage(`Could not import this Excel file: ${error instanceof Error ? error.message : 'Unsupported or invalid .xlsx file'}`);
    }
  };

  const exportWorkbook = async () => {
    setMessage('');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const exported = new ExcelJS.Workbook();
      workbook.sheets.forEach((sheet) => {
        const worksheet = exported.addWorksheet(sheet.name);
        Object.entries(sheet.widths).forEach(([column, width]) => { worksheet.getColumn(Number(column)).width = width / 7; });
        Object.entries(sheet.cells).forEach(([address, value]) => {
          const cell = worksheet.getCell(address);
          if (value.startsWith('=')) {
            const calculated = getDisplayValue(value, sheet, address);
            cell.value = { formula: value.slice(1), ...(calculated.startsWith('#') ? {} : { result: Number.isFinite(Number(calculated)) ? Number(calculated) : calculated }) };
          } else {
            const dataType = sheet.types[address] ?? inferCellType(value);
            if (dataType === 'number') cell.value = Number(value);
            else if (dataType === 'boolean') cell.value = value.toLowerCase() === 'true';
            else if (dataType === 'date') {
              const date = new Date(value);
              cell.value = Number.isNaN(date.getTime()) ? value : date;
            } else cell.value = value;
          }
          const style = sheet.styles[address];
          if (style) {
            cell.font = { bold: style.bold, italic: style.italic, color: style.color ? { argb: `FF${style.color.replace('#', '')}` } : undefined };
            if (style.align) cell.alignment = { horizontal: style.align };
            if (style.background) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${style.background.replace('#', '')}` } };
          }
        });
      });
      const buffer = await exported.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'spreadsheet.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Workbook exported as spreadsheet.xlsx');
    } catch (error) {
      console.error('Excel export failed.', error);
      setMessage(`Could not export the workbook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const searchResult = useMemo(() => {
    if (!search || !activeSheet) return '';
    return Object.entries(activeSheet.cells).find(([, value]) => value.toLowerCase().includes(search.toLowerCase()))?.[0] ?? '';
  }, [activeSheet, search]);

  if (databaseStatus === 'loading') return <main className="spreadsheet-page spreadsheet-database-message"><p role="status">Loading the shared workbook from Supabase…</p></main>;
  if (databaseStatus === 'error') return <main className="spreadsheet-page spreadsheet-database-message"><p role="alert">{saveError}</p><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry connection</button></main>;
  if (!activeSheet) return null;
  const style = activeSheet.styles[selectedAddress] ?? {};

  return (
    <main className="spreadsheet-page">
      <div className="spreadsheet-title"><span className="spreadsheet-title-icon">▦</span><div><h1>Country-Level Fee Workbook</h1><p>Shared administrator fee workbook · autosaved to Supabase</p></div><span className={`spreadsheet-local-status is-${saveStatus}`} role={saveStatus === 'error' ? 'alert' : 'status'}>● {message || (saveStatus === 'saving' ? 'Saving to database…' : saveStatus === 'error' ? 'Database save failed' : 'Saved to database')}</span></div>
      {saveStatus === 'saving' && <div className="spreadsheet-upload-progress" role="progressbar" aria-label="Saving workbook to Supabase" aria-valuetext="Save in progress"><span /></div>}
      {saveNotification && <div className="spreadsheet-save-notification" role="status">{saveNotification}</div>}
      {saveStatus === 'error' && <div className="spreadsheet-save-error" role="alert"><span>{isSaveTimeout ? 'Supabase timed out while saving. The result may be uncertain; retrying the same workbook is safe and will not create a duplicate version.' : saveError}</span><button type="button" onClick={() => {
        if (saveError.toLowerCase().includes('changed in another session')) setLoadAttempt((attempt) => attempt + 1);
        else setSaveAttempt((attempt) => attempt + 1);
      }}>{saveError.toLowerCase().includes('changed in another session') ? 'Reload shared workbook' : isSaveTimeout ? 'Retry save safely' : 'Retry save'}</button></div>}
      <PricingSheet />
      <SpreadsheetToolbar onUndo={undo} onRedo={redo} onImport={() => importInput.current?.click()} onExport={() => void exportWorkbook()} onSave={updateDatabase} isSaving={saveStatus === 'saving'} canUndo={history.undo.length > 0} canRedo={history.redo.length > 0} search={search} setSearch={setSearch} />
      <input ref={importInput} className="spreadsheet-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void importWorkbook(event)} />
      <div className="spreadsheet-formatting-toolbar">
        <span className="sheet-font-name">Calibri</span><span className="sheet-font-size">11</span>
        <button type="button" className={style.bold ? 'is-pressed' : ''} onClick={() => setCellStyle('bold', true)} aria-label="Bold"><b>B</b></button>
        <button type="button" className={style.italic ? 'is-pressed' : ''} onClick={() => setCellStyle('italic', true)} aria-label="Italic"><i>I</i></button>
        <button type="button" onClick={() => setCellStyle('align', 'left')} aria-label="Align left">≡</button>
        <button type="button" onClick={() => setCellStyle('align', 'center')} aria-label="Align center">☷</button>
        <button type="button" onClick={() => setCellStyle('align', 'right')} aria-label="Align right">≣</button>
        <label className="sheet-color-control" title="Text color"><span>A<span className="sheet-color-swatch" style={{ background: style.color ?? '#172a46' }} /></span><input type="color" value={style.color ?? '#172a46'} onChange={(event) => setCellStyle('color', event.target.value)} /></label>
        <label className="sheet-color-control sheet-fill-control" title="Cell background"><span>▱<span className="sheet-color-swatch" style={{ background: style.background ?? '#ffffff', border: '1px solid #dce6ec' }} /></span><input type="color" value={style.background ?? '#ffffff'} onChange={(event) => setCellStyle('background', event.target.value)} /></label>
        <span className="sheet-toolbar-divider" />
        <button type="button" onClick={() => insertDelete('row', 'insert')}>＋ Row</button>
        <button type="button" onClick={() => insertDelete('row', 'delete')}>− Row</button>
        <button type="button" onClick={() => insertDelete('column', 'insert')}>＋ Column</button>
        <button type="button" onClick={() => insertDelete('column', 'delete')}>− Column</button>
      </div>
      <div className="spreadsheet-formula-bar">
        <input aria-label="Selected cell address" value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} onBlur={() => {
          const position = parseAddress(addressDraft);
          if (position) setSelected(position);
          else setAddressDraft(selectedAddress);
        }} onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const position = parseAddress(addressDraft);
            if (position) setSelected(position);
            gridRef.current?.focus();
          } else if (event.key === 'Escape') {
            setAddressDraft(selectedAddress);
            gridRef.current?.focus();
          }
        }} />
        <span className="formula-symbol">fx</span>
        <input aria-label="Cell value or formula" value={formulaDraft} onChange={(event) => setFormulaDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const value = event.currentTarget.value;
            commitCell(selectedAddress, value);
            moveSelection(1, 0);
            gridRef.current?.focus();
          }
        }} onBlur={(event) => {
          const value = event.currentTarget.value;
          if (value !== (activeSheet.cells[selectedAddress] ?? '')) commitCell(selectedAddress, value);
        }} />
        {search && <span className="spreadsheet-search-count">{searchResult ? `Match: ${searchResult}` : 'No matches'}</span>}
      </div>
      <SpreadsheetGrid sheet={activeSheet} selected={selected} setSelected={setSelected} editing={editing} setEditing={setEditing} editValue={editValue} setEditValue={setEditValue} commitEdit={() => commitCell(selectedAddress, editValue)} search={search} widths={widths} resizeColumn={resizeColumn} gridRef={gridRef} onKeyDown={handleGridKeyDown} />
      <div className="spreadsheet-group-bar">
        <label className="spreadsheet-group-label" htmlFor="client-group-select">Client Type</label>
        <select id="client-group-select" className="spreadsheet-group-select" value={activeGroup} onChange={(event) => {
          const group = event.target.value as ClientGroup;
          setActiveGroup(group);
          const firstOfGroup = workbook.sheets.find((s) => s.name.endsWith(`(${group})`));
          if (firstOfGroup) { setActiveId(firstOfGroup.id); setSelected({ row: 1, column: 1 }); setWidths({}); }
        }}>
          {CLIENT_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <WorksheetTabs sheets={groupSheets} activeId={activeId} setActiveId={(id) => { setActiveId(id); setSelected({ row: 1, column: 1 }); setWidths({}); }} renameSheet={renameSheet} deleteSheet={requestDeleteSheet} onAddSheet={addSheet} renameError={renameError} />
      </div>
      <div className="spreadsheet-statusbar"><span>{activeSheet.name}</span><span>Cell {selectedAddress}</span><span>Shared with administrators · Supabase</span></div>
      {sheetPendingDelete && <AdminDeleteSheetModal
        sheetName={sheetPendingDelete.name}
        password={deletePassword}
        setPassword={setDeletePassword}
        error={deleteError}
        busy={deleteBusy}
        onCancel={() => { setSheetPendingDelete(null); setDeletePassword(''); setDeleteError(''); }}
        onConfirm={() => void confirmDeleteSheet()}
      />}
    </main>
  );
}
