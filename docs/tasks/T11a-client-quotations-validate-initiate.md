# T11a — Client Quotations: Validate & Initiate

**Route:** `/client-dashboard/quotations`
**Branch:** `task/t11a-client-quotations`

---

## Goal

When a **client** user opens the quotations page, the system must:

1. Detect their **client type** (`chinese`, `non_chinese`, `direct`) from the `clients` table.
2. Pull the matching fee rows from the `pricing_sheet` table for that client type.
3. Let the client create a quotation by selecting:
   - **Service / Project** (category: Trademark, Patent, Design, Copyright, Others)
   - **Country**
   - **Procedure(s)** (multiple allowed per item)
4. Display the **Type of Class** assigned to that country/procedure combination (from `fee_classes` / `class_rates`):
   - Per mark per class
   - Multi-class
   - Up to 3 classes
   - Up to 5 classes
5. Let the client choose the **class input method**:
   - **Specific classes** — pick individual class numbers (1–45)
   - **Count** — enter a number of classes
6. Validate that fees exist for the selected combination before allowing submission.
7. Calculate totals using the spreadsheet fees + class pricing logic already in the backend.

---

## Current State (audit summary)

| Area | Status | Notes |
|---|---|---|
| Client type column | Exists | `clients.client_type` — values: `chinese`, `non_chinese`, `direct` |
| `pricing_sheet` table | Exists | Rows keyed by `(client_type, item_key)` with official/attorney/total fees |
| `get-pricing-for-client.ts` | Exists | Loads pricing by `client_type`, expects ≥ 7 items |
| Quotation backend (`quotations/index.ts`) | Exists | Full CRUD, `resolveItems()` prices items from spreadsheet fees |
| Quotation frontend (`quotations/page.tsx`) | Exists | ~2,600-line shared page; `clientView` flag for client role |
| `TrademarkClassSelector` component | Exists | 45-class grid, supports all 4 class types |
| Class pricing logic (`quotation-class-pricing.ts`) | Exists | `calculateClassPricing()`, `availableClassTypes()` |
| Spreadsheet fee parser (`spreadsheet-fees.ts`) | Exists | Parses workbook into `SpreadsheetFee[]` with class rates |

---

## What Needs to Change

### A. Frontend — Client quotation form validation

1. **Show client type** — Display the assigned client type (Chinese / Non-Chinese / Direct) as a read-only label on the form so the client knows which pricing tier applies.
2. **Service / Country / Procedure selection** — Already works. Verify that:
   - Procedures filter correctly by selected service/category.
   - Multiple procedures are selectable per item.
   - Country dropdown shows only countries with available fees.
3. **Type of Class display** — After selecting country + procedure:
   - Show which class types are available for that country (uses `availableClassTypes()` from `class_rates`).
   - If only one class type is available, auto-select it.
   - If multiple, let the client choose.
4. **Class input method** — Already has `classEntryMode` state (`"specific"` | `"count"`):
   - **Specific**: show `TrademarkClassSelector` (1–45 grid).
   - **Count**: show numeric input.
   - Validate: at least 1 class required for Trademark category.
5. **Fee validation** — Before adding an item to the cart:
   - Check that a matching fee exists in `lookup.fees` for the selected country + category + procedure.
   - If no fee exists, show a clear error message (e.g., "No pricing available for this combination").
   - Do NOT allow adding an item with zero fees unless it is intentional (e.g., "Others" category).
6. **Pricing preview** — Show the calculated fees (official, attorney, total) before the client confirms the item, so they know the cost.

### B. Backend — Pricing resolution for client type

1. **Verify `resolveItems()`** uses the client's `pricing_client_type` to look up correct fees from `pricing_sheet` or `spreadsheet_workbooks`.
2. **Ensure the lookup endpoint** (`?lookup=true`) returns:
   - The client's `client_type` (already returned via `current_client_id` → join to `clients`).
   - The `pricing_sheet` rows for that client type (already included in lookup response).
   - The `class_rates` for class pricing (already included).
3. **Validate on the server** that the submitted items have valid fees before creating the quotation.

### C. UX flow (client perspective)

```
Client opens /client-dashboard/quotations
  → Sees list of their quotations (existing)
  → Clicks "New Quotation"
  → Form shows:
      Client: [auto-filled, read-only]
      Client Type: [Chinese / Non-Chinese / Direct — read-only label]
      Service/Project: [Trademark ▼]
      Country: [select]
      Procedure(s): [multi-select, filtered by service]
      --- (after selecting above) ---
      Type of Class: [Per mark per class ▼] (auto-detected from country)
      Class Input: [Specific | Count]
        → Specific: grid of 1–45
        → Count: numeric input
      Quantity (marks): [1]
      --- Fee preview ---
      Official Fee: $X
      Attorney Fee: $Y
      Total: $Z
      [Add to Cart]
  → Cart shows all items with subtotals
  → [Submit Quotation] → status = "Pending Approval"
```

---

## Files likely to change

| File | Change |
|---|---|
| `frontend/app/quotations/page.tsx` | Client type label, fee validation, class type auto-detect, pricing preview |
| `frontend/src/components/TrademarkClassSelector.tsx` | Possibly minor — verify class type filtering works |
| `backend/supabase/functions/quotations/index.ts` | Verify `resolveItems()` uses `pricing_client_type`, server-side validation |
| `backend/supabase/functions/_shared/get-pricing-for-client.ts` | No change expected — already correct |
| `backend/supabase/functions/_shared/quotation-class-pricing.ts` | No change expected — already correct |

---

## Acceptance Criteria

- [x] Client sees their client type (Chinese / Non-Chinese / Direct) on the quotation form.
- [x] Fees are pulled from `pricing_sheet` based on the client's assigned `client_type`.
- [x] Service, Country, Procedure selection works with correct filtering.
- [x] Type of Class is displayed and auto-detected based on country + procedure.
- [x] Class input method (specific vs. count) works for all class types.
- [x] Fee preview shows before adding an item to the cart.
- [x] Validation prevents submitting items with no matching fees.
- [x] Server validates pricing on submission (no client-side bypass).
- [x] Quotation is created with status "Pending Approval".
- [x] No regressions in admin quotation flow.
- [x] View/Delete/Success modals use cyan client theme (not admin purple).
- [x] Loading state shows animated spinner instead of plain text.

---

## Implementation Summary

### Phase 1: Client type validation & pricing tier (done)
- Added pricing tier label (`.client-pricing-tier`) showing Chinese / Non-Chinese / Direct
- Added warning banner when `client_type` is null
- Block quotation submission when client type is missing

### Phase 2: Client-type-specific spreadsheet fees (done)
- Added `parseSheetClientType()` to `spreadsheet-fees.ts` — extracts suffix from tab names like "Trademark(Chinese)"
- Modified `parseSpreadsheetPricing()` to accept optional `clientType` param
- Sheet iteration filters by client type: client view uses type-specific tabs, admin uses generic tabs
- `loadLookups()` passes client type for client role
- `resolveItems()` looks up client type from `clients` table for server-side validation

### Phase 3: UI polish & consistency (done)
- Added client-scoped overrides in `client-quotation.css` for View modal, Delete modal, and Success dialog — all now use cyan theme instead of admin purple/indigo
- Added animated loading spinner (`.quotation-loading`) for both client (cyan) and admin (indigo) views
- All modals, buttons, and status indicators are visually consistent with the client cyan theme

### Files changed

| File | Change |
|---|---|
| `frontend/app/quotations/page.tsx` | Pricing tier label, client_type validation, loading spinner wrapper |
| `frontend/app/quotations/client-quotation.css` | Pricing tier styles, View/Delete/Success modal overrides, loading spinner |
| `frontend/app/quotations/quotation.css` | Admin loading spinner |
| `backend/supabase/functions/_shared/spreadsheet-fees.ts` | `parseSheetClientType()`, `clientType` param in `parseSpreadsheetPricing()` |
| `backend/supabase/functions/quotations/index.ts` | Client type in `loadLookups()` and `resolveItems()` |
| `backend/supabase/functions/clients/index.ts` | Updated client types to `chinese`/`non_chinese`/`direct` |

---

## Out of Scope

- Admin approval workflow (already exists).
- Invoice/PDF generation (already exists).
- Editing or cancelling quotations (already exists).
- Adding new client types beyond the existing three.
