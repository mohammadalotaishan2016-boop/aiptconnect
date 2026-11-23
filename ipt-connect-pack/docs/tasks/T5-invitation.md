# T5 – INVITATION MANAGEMENT & EMAIL INVITATION SYSTEM
## Existing Client Invitation, Company Verification & Registration

**Prerequisites:** T0, T1, and T4 must be completed.

**Project:** AIP&T Management System  
**Technology:** Existing Next.js + Supabase architecture  
**Implementation:** Production-ready, secure, tenant-aware invitation system.

# 17. TENANT SEARCH, FILTERING, SORTING & PAGINATION

## A. Search Functionality

Add a search bar at the top of the Tenant Management page.

Placeholder:

"Search by Client ID, Company Name, or Registered Email..."

Allow administrators to search by:

- Client ID
- Company Name
- Registered Email
- Tenant ID

Requirements:
- Search must use actual database records.
- Support partial and case-insensitive matching where appropriate.
- Search results must update without requiring a full page reload.
- Include a clear search button or automatic search.
- Include a clear-search option.
- Display a helpful message when no results are found.
- Debounce search input to avoid unnecessary database requests.

## B. Advanced Filters

Add filter controls for:

**Tenant Status**
- All
- Active
- Inactive
- Suspended

**Invitation Eligibility**
- All
- User Account Already Exists
- Eligible for Invitation
- Invitation Pending
- Invitation Expired
- Invitation Revoked
- Account / Tenant Mismatch

**Device Usage**
- All
- Available Device Slots
- Fully Utilized
- Device Limit Exceeded

**Registration Date**
- All Dates
- Today
- Last 7 Days
- Last 30 Days
- Custom Date Range

Include a Reset Filters action.

## C. Sorting

Allow administrators to sort the tenant list by:

- Client ID
- Company Name
- Registered Email
- Date Registered
- Maximum Devices
- Registered Devices
- Tenant Status

Support ascending and descending order.

Show the active sorting direction in the table header.

## D. Pagination

Implement server-side pagination for the Tenant Management table.

Default page size: 10 records.

Available page sizes:
- 10
- 25
- 50
- 100

Display pagination controls:

- First Page
- Previous Page
- Page Numbers
- Next Page
- Last Page

Display a record summary:

"Showing 1–10 of 125 tenants"

Also display:
- Total tenant count.
- Current page.
- Total pages.
- Selected page size.

Requirements:

1. Fetch only the records needed for the current page.
2. Do not load every tenant into the browser.
3. Use efficient Supabase queries.
4. Apply search and filters on the server/database.
5. Preserve sorting when changing pages.
6. Reset to page 1 when search or filters change.
7. Maintain correct pagination when records are added, removed, or updated.
8. Handle empty results and out-of-range pages.
9. Prevent duplicate requests when multiple controls change quickly.
10. Ensure all queries respect existing authorization and RLS policies.

## E. Search and Pagination Interaction

Search, filters, sorting, and pagination must work together.

Example:

An administrator searches for "aipt", selects Active status, sorts by Company Name ascending, and displays 25 records per page.

All results must reflect these conditions simultaneously.

Changing the search term or filters must reset pagination to the first page.

Changing the page size must also return to the first page.

## F. User Interface Layout

Recommended layout:

**Tenant Management**

[Search by Client ID, Company, or Email...]

[Status Filter] [Invitation Eligibility] [Device Usage] [Registration Date] [Reset Filters]

[Total Tenants] [Active] [Eligible for Invitation] [Pending Invitations]

Tenant Table:

| Client ID | Company | Registered Email | Date Registered | Max Devices | Registered Devices | Status | Invitation Eligibility | Actions |
|---|---|---|---|---|---|---|---|---|

Bottom pagination:

[Rows per page: 10 ▼]

Showing 1–10 of 125 tenants

[First] [Previous] [1] [2] [3] [...] [Next] [Last]

## G. Performance and Testing

Test:

1. Search by Client ID.
2. Search by partial company name.
3. Search by email.
4. Combine search with tenant status filters.
5. Combine multiple filters.
6. Sort ascending and descending.
7. Navigate between pages.
8. Change page size.
9. Search while on a later page.
10. Verify correct total counts.
11. Verify empty search results.
12. Verify pagination after tenant updates.
13. Verify pagination after invitation creation.
14. Verify unauthorized users cannot access tenant data.
15. Verify the page performs efficiently with large tenant datasets.

## FINAL REQUIREMENT

Search, filtering, sorting, and pagination must be fully integrated into the existing Tenant Management page.

Use server-side pagination and database-level filtering. Do not implement pagination by loading all tenant records into the frontend and slicing the array.

Preserve the existing invitation, device-limit management, tenant isolation, and authentication functionality.