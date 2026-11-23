# T9a — Spreadsheet Pricing: Client-Type Group Selector

## Goal
Add a **client-type group selector** to the Country-Level Fee Workbook page (`/spreadsheet`)
so the administrator can choose between three pricing groups. Each group has its own
set of 7 fee tabs with group-suffixed names. All data is stored per group.

## Route
`http://localhost:3000/spreadsheet` (admin dashboard)

## Client-Type Groups

| Group | Tabs |
|---|---|
| **Chinese** | Trademark(Chinese), Patent(Chinese), Design(Chinese), Copyright(Chinese), Up to 3 classes(Chinese), Up to 5 classes(Chinese), Multi-classes(Chinese) |
| **Non Chinese** | Trademark(Non Chinese), Patent(Non Chinese), Design(Non Chinese), Copyright(Non Chinese), Up to 3 classes(Non Chinese), Up to 5 classes(Non Chinese), Multi-classes(Non Chinese) |
| **Direct** | Trademark(Direct), Patent(Direct), Design(Direct), Copyright(Direct), Up to 3 classes(Direct), Up to 5 classes(Direct), Multi-classes(Direct) |

## Behaviour

1. A dropdown/select control at the top of the spreadsheet page lets the administrator
   pick a group: **Chinese**, **Non Chinese**, or **Direct**.
2. When a group is selected, the worksheet tabs update to show the 7 tabs for that group.
3. Each group has its own independent set of sheet data (cells, styles, widths, types).
4. All three groups are stored together in the same workbook JSON in Supabase
   (`spreadsheet_workbooks.workbook`).
5. Import/Export and autosave work across all groups — the full workbook
   (all 21 sheets: 7 × 3 groups) is saved and loaded as one unit.
6. Default group on load: Chinese (first group).

## Files likely changed
- `frontend/app/spreadsheet/page.tsx` — group selector UI, tab filtering, workbook structure
- `frontend/app/spreadsheet.css` — styling for the group selector
- `backend/supabase/functions/_shared/spreadsheet-fees.ts` — parser may need group-awareness

## Files changed
- `frontend/app/spreadsheet/page.tsx` — group selector UI, tab filtering, 21-sheet workbook, migration, add-sheet button, expanded formula engine
- `frontend/app/spreadsheet.css` — group bar, color swatch, add-sheet button styling

## Acceptance criteria
- [x] Group selector visible above tabs, styled with primary color (#17a2b8)
- [x] Selecting a group shows only that group's 7 tabs
- [x] Each group's sheets hold independent data
- [x] Switching groups preserves data in the other groups
- [x] Autosave and manual "Update Database" save all 21 sheets
- [x] Import Excel imports into the currently active tab of the active group
- [x] Export Excel exports the full workbook (all groups)
- [x] Existing workbook data migrates cleanly (current 7 sheets become Chinese group)
- [x] Add more functions in formula engine (MIN, MAX, COUNT, ABS, ROUND, INT, MOD, POWER, IF)
- [x] Font color tool with visible swatch indicator
- [x] Add Sheet (＋) tab button per group
- [x] Missing group sheets auto-created on load (normalizeWorkbook fill-missing pass)
