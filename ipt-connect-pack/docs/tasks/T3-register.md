# T3. Register

Read CLAUDE.md first. Prerequisites: T0 and T1 done.

- Country code picker: ALL international dialing codes with flag, country name, code.
  Searchable and scrollable.
- Country selection: ALL countries, sorted, searchable. Use ONE shared dataset so both fields stay
  in sync; selecting a country suggests its code.
- Validate phone (E.164) and email with Zod on client and server. Clear field-level errors.
- Registration data must match the `users` table exactly.
- Self-registration always creates role 'client' with status 'pending'. It can never create an
  administrator or an active user.
- No OTP or email verification step during registration.
- Test: pending user cannot log in; cannot register as administrator; duplicate email handled.

## Client Type (Chinese / Non Chinese / Direct)

Each client user has a **client_type** that determines which fee pricing group applies.

| Client Type | When assigned |
|---|---|
| **Chinese** | Auto-filled when selected country is China (CN), Hong Kong (HK), Macau (MO), or Taiwan (TW) |
| **Non Chinese** | Auto-filled for all other countries |
| **Direct** | Manually selected by administrator only (not available during self-registration) |

### Registration behaviour
1. The registration form includes a **Country** field (already specified above).
2. When a new client user selects a country, the **Client Type** field is auto-filled:
   - China, Hong Kong, Macau, Taiwan → **Chinese**
   - All other countries → **Non Chinese**
3. The Client Type field is **read-only** during self-registration (auto-determined by country).
4. The **Direct** option is only available when an administrator creates/edits a client user.
5. The `client_type` value is stored on the user's profile and used to look up the correct
   pricing group in the fee workbook (see T9a).

### Chinese country codes (ISO 3166-1 alpha-2)
`CN`, `HK`, `MO`, `TW`
