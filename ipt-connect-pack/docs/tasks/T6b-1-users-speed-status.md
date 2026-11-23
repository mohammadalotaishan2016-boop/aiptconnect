# T6b-1. "Users Registered" page (/users): speed and statuses

Read CLAUDE.md first. Prerequisite: T0 to T6 done. Administrator only.
Audit the page first. Show how current states are stored and the mapping to the status model.
Do not add columns without my approval. Wait for approval, then implement.
Priority: speed, then status simplification. (Actions, edit, import/export are in T6b-2.)

## 1. Speed (the page must never hang)
- Replace "Loading users..." and "Refreshing..." with skeleton rows and cached data first.
- Summary cards come from ONE aggregate query or SQL function (counts by status and role in one
  call), cached briefly and refreshed in the background. Not one query per card.
- Table: server-side pagination (keyset/cursor for large offsets), sorting, debounced search
  (trigram or full-text index), filters. Rows per page 10, 25, 50.
  Select only the columns shown, with an index for every filter.
- Tab counts come from the same aggregate. No page-wide re-fetch when switching tabs.

## 2. Statuses
- Summary cards: Total, Pending, Active, Suspended, Deactivated, Locked.
- Tabs: "Need approval" (pending) and "Locked" FIRST with count badges, then All, Client accounts,
  Admin accounts, Active, Suspended, Deactivated.
- Filters: Role (administrator | client only), Status, Search.

## 3. Table columns and layout
- Keep: #, Full name, Assigned No., Company, Department, Role/Position, Status, Last Login.
- Add: Role, Max devices, Active devices (count).
- Move Import Excel, Excel, and PDF / Print into one "More" menu. Keep "Invite Client" visible.
- Hide Department and Assigned No. on small screens.

## 4. Verification
- With 100,000 test users (staging only) the first rows appear in under 1 second, no blocking spinner.
- Cards, tabs, and filters work.
