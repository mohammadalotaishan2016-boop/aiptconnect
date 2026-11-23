# T11a — Client Dashboard Quotations: Materialized Fees & On-Demand Lookup

## Problem

The client dashboard quotations page (`/client-dashboard/quotations`) failed with
**546 / ERR_QUIC_PROTOCOL_ERROR** because the `quotations?lookup=true` endpoint:

1. Loaded the entire spreadsheet workbook JSONB blob from DB (~10-50MB raw)
2. Parsed every cell formula in every sheet via `parseSpreadsheetPricing()` (CPU-intensive)
3. Returned up to 500K fee records + 36K class rates in a single JSON response (~100MB)
4. Even gzip-compressed (8-15MB), this exceeded QUIC frame limits and Deno Deploy memory

Previous fixes (timeout increase, gzip, payload filtering) were insufficient because
the payload size and memory consumption were the core issues.

## Solution: Materialized Fees + On-Demand Lookup

### Architecture

1. **Materialize once per revision**: When the spreadsheet workbook is saved, parse it
   once and store pre-computed fees in indexed PostgreSQL tables.
2. **On-demand lookup**: Instead of sending all 500K fees to the browser, fetch 1-50
   records per country+category selection via tiny indexed queries.

### Database Migration (`backend/supabase/migrations/202611210005_materialize_fees.sql`)

Three new materialized tables with indexes and RLS policies:

- **`materialized_fees`** — Pre-computed fee data per revision, client_type, country, category, procedure
- **`materialized_class_rates`** — Pre-computed class pricing per revision, client_type, country, class_type
- **`materialized_addon_fees`** — Pre-computed claiming priority and state fees

### Backend (`backend/supabase/functions/quotations/index.ts`)

- **`POST ?action=materialize`** — Admin-only endpoint that parses the workbook once for
  each client_type (null, chinese, non_chinese, direct) and upserts into materialized tables.
  Deletes old revision data. Called automatically after spreadsheet save.
- **`GET ?fee_lookup=true&country_id=X&category=Y`** — Returns fees for one country+category
  from materialized tables (1-50 records, <5ms).
- **`GET ?class_rates=true&country_id=X`** — Returns class rates for one country.
- **`GET ?addon_fees=true&country_id=X`** — Returns claiming priority + state fees for one country.
- **`GET ?lookup=lite`** — Now includes requirements (previously only in full lookup).
- **`resolveItems()`** — Rewritten to query materialized tables instead of parsing the
  workbook on every save. Uses `lookupFees()`, `lookupClassRates()`, `lookupAddonFees()`.
- **`loadLookups()` (backward compat)** — The `lookup=true` endpoint now reads from
  materialized tables instead of parsing the workbook. Still used by the fees page.

### Frontend (`frontend/app/quotations/page.tsx`)

- **Single fast lookup**: Both admin and client views use `lookup=lite` (reference data
  only: clients, countries, procedures, services, requirements, vat_rates). No fee data.
- **On-demand fee cache**: When the user selects countries + category, fees and class rates
  are fetched per country from the new API endpoints and cached in component state.
- **`cachedFees` / `cachedClassRates`** — Memoized from the fee/class-rate caches for
  the current country+category selection. Used by `selectionFees`, `classTypeOptions`, etc.
- **"Review Quotation" button** enables immediately after the lite lookup completes
  (no longer blocked by fee loading).

### Spreadsheet Page (`frontend/app/spreadsheet/page.tsx`)

- After `save_shared_spreadsheet` increments the workbook revision, the page triggers
  `POST quotations?action=materialize` in the background to repopulate materialized tables.

## Deployment Steps

1. **Run migration SQL** in Supabase Dashboard SQL Editor (creates 3 materialized tables)
2. **Deploy edge function**: `supabase functions deploy quotations`
3. **Run initial materialization**: Call `POST quotations?action=materialize` as admin
   (or save the spreadsheet once to trigger it automatically)

## Verification

1. Log in as a client user.
2. Navigate to `/client-dashboard/quotations`.
3. Confirm the page loads fast (lite lookup only, <2s).
4. Confirm "Review Quotation" button becomes enabled after lookup completes.
5. Select service → country → procedure → confirm fees load on-demand.
6. Click "Review Quotation" → confirm form modal opens with correct fees.
7. Save a quotation → confirm `resolveItems` resolves fees from materialized tables.
8. Verify admin quotations page still works as before.
9. Save spreadsheet workbook → confirm materialization triggers automatically.
