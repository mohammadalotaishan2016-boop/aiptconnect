# T6 — Admin Pages, User Management, Permissions & Audit Logs

## 1. Instructions

Read `CLAUDE.md` first and follow all project conventions, architecture, security requirements, and existing design system.

**Prerequisites:** T0–T5 must already be completed.

**Scope:** T6 Admin functionality only. User management (`/users`) is included in this task. T6b is not part of this task.

Before making changes:
- Inspect the existing project architecture and relevant files.
- Identify all admin pages, APIs, Supabase functions, authentication middleware, database tables, and permission checks.
- Identify the root cause of existing errors.
- Preserve existing working production functionality.
- Do not unnecessarily modify DNS, deployment configuration, Supabase configuration, or unrelated modules.

---

## 2. Admin UI Design

Redesign and standardize **every administrator page** using the existing project's design system.

Requirements:
- Use the same primary color, typography, font family, spacing, buttons, cards, tables, forms, modals, and status badges throughout all admin pages.
- Use a clean, professional, modern dashboard design.
- Ensure responsive layouts for desktop, tablet, and mobile.
- Improve table readability, search, filtering, pagination, loading states, empty states, and error handling.
- Avoid inconsistent colors, fonts, or duplicate design styles.
- Reuse existing components wherever possible.
- Do not introduce unnecessary dependencies.

---

## 3. User Management (/users)

Redesign the user management page with a professional, responsive table and complete user-management functionality.

### Table columns

Display the following columns:

1. Full Name
2. Assigned Number
3. Company
4. Department — remove this field completely
5. Client Fee Status
6. Role / Position
7. User Role
8. Status
9. Number of Devices
10. Country
11. Account Status
12. Last Login
13. Date Registered
14. Actions

### Client Fee Status

Provide the following options:

- Auto Save
- Chinese
- Non-Chinese
- Direct

Ensure the selected fee status is correctly stored in the database and displayed consistently.

### User fields

The Add/Edit User form must include:

- Full Name
- Assigned Number
- Company
- Client Fee Status
- Role / Position
- User Role: `administrator` or `client`
- Country
- Status
- Max Devices: integer from 1 to 10, default 1

Remove the Department field from the UI and applicable user-management forms.

### Max Devices

Implement device limits correctly.

- Default: 1 device
- Minimum: 1
- Maximum: 10
- Administrator can configure the limit for other users.
- Enforce the limit on the backend during login/device registration.
- Do not rely on frontend validation alone.
- Prevent users from modifying their own Max Devices setting.

### Account management actions

Administrators must be able to:

- Add users
- Edit users
- Assign roles
- Set Max Devices
- Approve pending accounts
- Suspend accounts
- Deactivate accounts
- Reactivate accounts
- Unlock accounts
- Resolve unblock requests
- View user devices
- Force logout user devices
- Delete client accounts

Add a clearly visible **Delete Client Account** action for administrators.

Deletion requirements:
- Only administrators may delete client accounts.
- Require confirmation before deletion.
- Clearly warn that deletion may be irreversible.
- Prevent deleting administrator accounts through the client deletion action.
- Prevent administrators from deleting their own account.
- Protect related records and maintain database integrity.
- Use a safe deletion strategy consistent with the existing database architecture.
- Record the deletion in `audit_logs`.
- Ensure deleted users cannot authenticate or access the application.

---

## 4. Permissions — Single Shared Permission Map

Implement ONE centralized permission map used by both frontend UI visibility and backend/API authorization.

Do not create separate or inconsistent permission logic across pages, API routes, Supabase functions, or components.

### Permission Matrix

| Action | Administrator | Client |
|---|---|---|
| View all clients / tenants | Yes | No |
| Invite / add user | Yes | No |
| Approve pending user | Yes | No |
| Edit users | Yes | No |
| Change another user's role | Yes | No |
| Change another user's Max Devices | Yes | No |
| Suspend / deactivate / unlock users | Yes | No |
| Resolve unblock requests | Yes | No |
| View any user's devices | Yes | No |
| Force logout any user's devices | Yes | No |
| View audit logs | Yes | No |
| Use client dashboard modules | Yes (view/support) | Yes (own tenant only) |
| View own devices | Yes | Yes |
| Log out own other devices | Yes | Yes |
| Approve / deny new-device login for own account | Yes | Yes |
| Change own password | Yes | Yes |
| Edit own profile | Yes | Yes |
| Change own role | No | No |
| Change own status | No | No |
| Change own Max Devices | No | No |

### Security requirements

- Enforce permissions on the server side.
- UI visibility is not a security boundary.
- Protect every administrator API endpoint, page, server action, and Supabase function.
- Clients must not be able to access administrator functionality by directly calling APIs.
- Clients must not access other tenants' data.
- Prevent self-escalation of privileges.
- Prevent users from modifying their own role, account status, or Max Devices.
- Validate all request payloads on the backend.
- Return appropriate HTTP status codes (`401`, `403`, `404`, `400`, etc.).
- Never trust role information submitted by the frontend.
- Ensure permission checks use the authenticated user's trusted identity and database-authoritative role.

---

## 5. Audit Logs

Every administrator action must be recorded in `audit_logs`.

Record at minimum:

- Administrator ID
- Action
- Target user ID, when applicable
- Timestamp
- IP address, when available
- Relevant metadata
- Success/failure status, where supported

Audit the following actions:

- User creation
- User invitation
- User approval
- User editing
- Role changes
- Max Devices changes
- Account suspension
- Account deactivation
- Account activation
- Account unlocking
- Unblock request resolution
- Device logout / forced logout
- Client account deletion
- Admin access to relevant sensitive management operations

Requirements:

- Audit logging must be performed securely on the server.
- Users must not be able to edit or delete audit records.
- Clients must not access audit logs.
- Administrators must have a dedicated audit-log page.
- Provide search, filters, pagination, timestamps, action types, administrator, and target user.
- Do not expose passwords, tokens, secrets, or sensitive authentication information in audit metadata.

---

## 6. Fix Project Service / Supabase Connection Error

Fix the following existing error:

> Unable to reach the project service. Check your network connection and Supabase URL. (Failed to fetch)

Investigate the actual root cause before changing code.

Check:

- Supabase URL and environment variables
- Supabase anon/public key configuration
- Client and server Supabase initialization
- Incorrect or missing environment variables
- API endpoint URLs
- Edge Function URLs
- CORS configuration
- Network request failures
- Authentication/session handling
- Expired tokens
- Function deployment status
- Incorrect request methods or headers
- Backend exceptions
- Frontend error handling
- Production versus local environment configuration

Requirements:

- Do not simply hide the error.
- Do not replace real API calls with mock data.
- Do not disable authentication or security checks to make the error disappear.
- Do not unnecessarily change existing Supabase configuration.
- Fix the underlying cause.
- Ensure the project service and user management functions work correctly in local and production environments.
- Provide meaningful error messages when the service is genuinely unavailable.

---

## 7. Database & Migration Safety

Inspect the existing database schema before creating or modifying tables.

- Reuse existing tables and columns wherever possible.
- Create migrations only when necessary.
- Ensure migrations are safe and reversible where practical.
- Do not duplicate user, tenant, role, device, or audit tables.
- Ensure Row Level Security (RLS) is properly configured.
- Ensure client users can access only their own permitted records.
- Ensure administrator privileges cannot be obtained through direct database requests.
- Protect audit logs from unauthorized modification.
- Ensure Max Devices is enforced by the authentication/device registration backend.

---

## 8. Testing & Verification

Test all functionality before declaring T6 complete.

### Administrator tests

- Administrator can access admin pages.
- Administrator can add, edit, approve, suspend, deactivate, unlock, and delete eligible client accounts.
- Administrator can change client roles and Max Devices.
- Administrator can view audit logs.
- Administrator can view and force logout other users' devices.
- Administrator can access client dashboard modules in support/view mode.
- Administrator cannot modify their own role, status, or Max Devices.
- Administrator cannot delete their own account.

### Client security tests

- Client cannot access `/users` administrator functionality.
- Client cannot access administrator APIs.
- Client cannot access audit logs.
- Client cannot view or modify other tenants' data.
- Client cannot create or approve users.
- Client cannot modify another user's role or device limits.
- Client cannot change their own role, status, or Max Devices.
- Client can access their own dashboard.
- Client can view their own devices and log out their own other devices.
- Client can approve/deny new-device login requests for their own account.
- Client can edit their own profile and password.

### Functional tests

- User creation and editing work.
- User deletion works safely.
- Max Devices validation works from 1 to 10.
- Device limits are enforced server-side.
- Audit logs are created for all administrator actions.
- Search, filters, and pagination work.
- Responsive UI works.
- No console errors.
- No TypeScript errors.
- No lint errors.
- No broken API calls.
- Supabase connection error is resolved.
- Existing production features remain functional.

---

## 9. Implementation Rules

1. Read `CLAUDE.md` before starting.
2. Inspect the existing code before modifying it.
3. Identify the root causes of the permission and connection errors.
4. Use the existing architecture and design system.
5. Create one shared permission map.
6. Apply the shared permission map to frontend and backend.
7. Implement secure database/API authorization.
8. Implement user management and Max Devices.
9. Implement administrator audit logging.
10. Add client account deletion with safety protections.
11. Fix the Supabase/project-service connection error.
12. Test all administrator and client permissions.
13. Fix any regressions caused by your changes.

**Do not stop after making UI changes. Complete the backend, database, security, and testing requirements.**

---

## 10. Final Report

When finished, provide a concise implementation report containing:

- Files changed
- Database migrations created
- Admin pages redesigned
- Permission map implementation
- API and backend security changes
- User management features completed
- Audit log implementation
- Client deletion implementation
- Root cause and fix for the Supabase connection error
- Tests performed and their results
- Any remaining issues or incomplete requirements

Do not claim a feature is complete unless it has actually been implemented and verified.
