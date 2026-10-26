import type { ReactNode } from 'react';

export type ActionName = 'add' | 'edit' | 'update' | 'delete' | 'view' | 'hide' | 'show' | 'pdf' | 'import' | 'export' | 'cancel' | 'download' | 'print' | 'refresh' | 'approve' | 'more';

const paths: Record<ActionName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m14 5 5 5" /></>,
  update: <><path d="M20 7v14H3V3h13l5 5" /><path d="M7 3v6h9V3M7 21v-8h10v8" /></>,
  delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  view: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  hide: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c7 0 10 7 10 7a15.8 15.8 0 0 1-3 4.1M6.2 6.2C3.5 8 2 12 2 12s3 7 10 7a10 10 0 0 0 4-.8" /></>,
  show: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><path d="M12 9v6M9 12h6" /></>,
  pdf: <><path d="M14 2H5v20h14V7l-5-5Z M14 2v6h5M8 12h8M8 16h5" /></>,
  import: <><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" /></>,
  export: <><path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3" /></>,
  cancel: <path d="m6 6 12 12M6 18 18 6" />,
  print: <><path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7Z" /><path d="M17 11h1" /></>,
  refresh: <><path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5" /></>,
  approve: <path d="m4 12 5 5L20 6" />,
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
};

export default function ActionIcon({ name }: { name: ActionName }) {
  return <svg className="aipt-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
