# T6b-2. "Users Registered" page (/users): actions, edit, import/export

Read CLAUDE.md first. Prerequisite: T6b-1 done. Administrator only.

## 1. Row actions menu
Edit, Approve, Suspend, Deactivate/Activate, Unlock, View devices, Force logout device,
Send password reset link, Resend invitation.
- Every action is confirmed, tenant-scoped, idempotent, and written to `audit_logs`.
- Locked users show their unblock request with Approve / Reject.

## 2. Edit user (drawer or modal)
- Fields: name, email, phone with country code (full list), country (full list), company,
  department, role/position, Role, Max devices (1 to 10).
- Zod validation on client and server. An administrator cannot change their own role, status,
  or Max devices. A client can never reach this page.

## 3. Import / Export
- Import Excel: validate each row with Zod, show a preview with errors, support a dry run,
  skip duplicates (email per tenant), insert in batches, report created, skipped, and failed rows.
  Never import a role other than administrator or client.
- Excel and PDF / Print export the current filtered result, generated on the server in streamed
  batches, without loading all rows into the browser.

## 4. Related pages (audit only, do not rebuild yet)
- Audit Client List and Roles & Permissions (/roles). Show me any role other than administrator
  and client before changing or removing it.

## 5. Verification
- Every action works and appears in the audit log. Import dry run and real run both tested.
