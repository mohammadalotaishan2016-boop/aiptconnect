# T12a — Client Dashboard: Fix Errors, Update Boxes, Add Header Customer Service

## Problem

### Console Error
```
Unable to reach the project service. Check your network connection and Supabase URL. (Failed to fetch)

at fetchSupabaseFunction (src/lib/supabase/browser.ts:119:11)
at async ClientDashboardPage.useEffect.loadCardUpdates (app/client-dashboard/page.tsx:111:25)
at async ClientDashboardPage.useEffect.loadCardUpdates (app/client-dashboard/page.tsx:105:9)
```

**Root cause**: On client dashboard load, `page.tsx` fired **12+ simultaneous HTTP requests**
to Supabase edge functions:

| Source | Requests |
|---|---|
| ClientShell auth check | 3 (getUser + profiles + clients) |
| loadCardUpdates | 1 (client-updates) + 8 parallel (one per card source) |
| loadTutorials | 1 (video-tutorials?client=true) |
| loadCardSettings | 1 (video-tutorials?availability=true) |
| Card route gate | 1 (video-tutorials?availability=true) |

Browsers limit concurrent connections (~6 for HTTP/2). With all requests at once,
some get queued past the 15s timeout or fail with `Failed to fetch` (network-level).

Additionally:
- `response.json()` calls had no `.catch()` — a malformed error body could crash the parse
- ClientShell showed a blocking "Checking client access..." screen while validating auth
- Customer Service box was in the grid (should be in header)
- DOA box was missing

## Solution

### 1. Fix connection flooding (`frontend/app/client-dashboard/page.tsx`)
- **Deferred card updates**: `loadCardUpdates` now starts after a 3-second delay
  (was immediate), letting essential auth/tutorials/settings calls complete first
- **Safe JSON parsing**: All `response.json()` calls wrapped with `.catch(() => ({}))`
  so malformed responses don't crash
- Removed `doa` from `cardUpdateSources` (no backend edge function exists yet)

### 2. Remove loading delay (`frontend/src/components/ClientShell.tsx`)
- Cached `accessState` in `sessionStorage` after first successful validation
- On mount: if cache exists, set `accessState='allowed'` immediately (no blocking screen)
- Background validation still runs — if it fails, signs out and redirects

### 3. Update dashboard boxes (`frontend/app/client-dashboard/page.tsx`)
Removed `customer-service` from destinations, displayLabels, translatedLabels, cardUpdateSources.
Added `doa` (Deed of Assignment) after News Feed.

**Final 8 boxes:**
1. Schedule of Fees
2. Quotation
3. Requirements
4. Statements
5. POA
6. Your Work
7. News Feed
8. DOA

### 4. Customer Service in header (`frontend/src/components/ClientShell.tsx`)
- Added Customer Service button (icon + text) between language selector and divider
- Links to `/client-dashboard/customer-service` (existing page)
- Added `customerService` translation to all 4 languages (en, ar, fil, zh)
- Removed `customer-service` from `readableDashboardRoutes` (no longer card-gated)

### 5. DOA placeholder page (`frontend/app/client-dashboard/doa/page.tsx`)
- New placeholder page: "Deed of Assignment — Coming soon"
- Added `doa` to `readableDashboardRoutes` for card availability gating

### 6. CSS (`frontend/app/client-home.css`)
- Added `.client-home-service-btn` styles (pill button matching header teal theme)
- Responsive: icon-only on screens < 650px

## Files Changed
- `frontend/app/client-dashboard/page.tsx` — boxes, error fixes, deferred updates
- `frontend/src/components/ClientShell.tsx` — header button, cached access, routes
- `frontend/app/client-home.css` — header button styles
- `frontend/app/client-dashboard/doa/page.tsx` — NEW placeholder page

## Verification
1. Login as client → dashboard loads instantly (no "Checking..." screen)
2. 8 boxes visible in correct order (no Customer Service box)
3. Customer Service button in header beside language selector
4. Click Customer Service button → navigates to /client-dashboard/customer-service
5. DOA box → navigates to /client-dashboard/doa (shows placeholder)
6. No "Unable to reach the project service" console errors
7. Card update badges load after 3s delay (non-blocking)
8. Responsive layout: 4→3→2→1 columns
