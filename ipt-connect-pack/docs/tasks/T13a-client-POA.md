# T13a — Validate Client POA Page

## Scope
Audit and fix the POA (Power of Attorney) page in the client dashboard:
- Auto-translate for applicant name and address
- Format for GPOA Apostille and GPOA Simply Signed
- Correct format for English (LTR + justify) and Arabic (RTL + justify)

## Bugs Found and Fixed

### 1. Address auto-translation corrupted (CRITICAL)
**File:** `frontend/app/api/poa/translate/route.ts`

The translate API prepended an instruction prompt to the address text before sending it
to Google Translate v2. This API is a plain machine translator — it translated the
instruction itself into Arabic, producing ~25 words of garbage before the actual address.

**Fix:** Removed the `addressPrompt` prefix. The API now sends only the raw address text.
Name translation was unaffected (no prompt was added).

### 2. Preview text not justified — CSS `text-align: both` invalid
**File:** `frontend/app/client-dashboard/poa/page.tsx`

`normalizeApostillePreview` used `paragraphAlignment()` return values directly as CSS
`textAlign`. The function returns Word XML value `'both'` for justify, but CSS requires
`'justify'`. Body text in the browser preview was not justified.

**Fix:** Added `wordAlignToCss()` helper that maps `'both'` → `'justify'`. Applied to
both apostille and simply-signed preview normalization.

### 3. Simply Signed had no preview normalization
**File:** `frontend/app/client-dashboard/poa/page.tsx`

The render effect only called `normalizeApostillePreview` for apostille. The simply-signed
template had no direction or alignment enforcement in the browser preview.

**Fix:** Added `normalizeSimplySignedPreview()` — sets LTR direction + justified alignment
on all paragraphs, left-align on signature fields (NAME, SIGNATURE, DATE). Called in the
render effect for the simply-signed template.

### 4. CSS fully duplicated (maintenance)
**File:** `frontend/app/client-dashboard/poa/poa.css`

The entire stylesheet (~41 rules) was duplicated — identical selectors appeared twice.
The first block was dead code due to CSS cascade.

**Fix:** Removed the duplicated first block, keeping the complete second block with
its additional print rules.

### 5. GPOA title "Power of Attorney (POA)" not centered in preview
**File:** `frontend/src/lib/poa-docx.ts`

`paragraphAlignment()` detected the Arabic title "وكالة" for centering but missed the
English "Power of Attorney (POA)". The DOCX generation handled it separately in
`normalizeApostilleDirection` with its own header check, but the shared alignment
function used by both DOCX and preview fell through to `'both'` (justify) for the
English title.

**Fix:** Added `text.includes('Power of Attorney (POA)')` to the center detection in
`paragraphAlignment()` so both the DOCX output and browser preview center the title.

### 6. Simply Signed title "Power of Attorney (POA)" not centered
**File:** `frontend/src/lib/poa-docx.ts`

`paragraphAlignment()` for the simply-signed template had no title detection at all.
The title "Power of Attorney (POA)" fell through to `'both'` (justify) in both DOCX
output and browser preview.

**Fix:** Added `text.includes('Power of Attorney (POA)')` → `'center'` check in the
simply-signed branch of `paragraphAlignment()`.

### 7. Apostille preview skipped single-cell rows for alignment
**File:** `frontend/app/client-dashboard/poa/page.tsx`

`normalizeApostillePreview` used `if (cells.length < 2) continue` which skipped
the entire row — merged/single-cell rows (e.g. spanning title) got no direction or
alignment normalization in the browser preview.

**Fix:** Changed to guard only the column-swap logic with `cells.length >= 2`, while
still processing alignment for all cells in every row.

### 8. Apostille Arabic column had no screen CSS justify fallback
**File:** `frontend/app/client-dashboard/poa/poa.css`

The apostille Arabic column had `direction:rtl; text-align:justify` only in
`@media print` rules. On screen, alignment relied entirely on the JS normalization.
If normalization missed a paragraph, it inherited the browser default (left-align).

**Fix:** Added screen CSS rules for `td:first-child` (LTR + justify) and
`td:nth-child(2)` (RTL + justify) as a baseline. The JS normalization overrides
per-paragraph (center for titles, right for Arabic labels).

## Validated (no changes needed)

| Area | Status |
|---|---|
| Auto-translate hook (`useAutoArabic`) | 500ms debounce, cache, manual edit, re-translate |
| Arabic service dictionary (10 services) | All translations present and correct |
| Arabic country overrides (12+ countries) | Overrides + Intl.DisplayNames fallback |
| GPOA Apostille DOCX format | Dual-column, English left / Arabic right, bold fields, correct margins |
| GPOA Simply Signed DOCX format | Single-column, LTR locked, correct margins |
| DOCX text direction | RTL + bidi for Arabic, LTR for English, language attributes set |
| DOCX justify alignment | `w:jc val="both"` correct Word XML for justify |
| Font normalization | Times New Roman forced on all runs |
| Number isolation | Unicode bidi isolates prevent digit reversal in RTL |
| A4 page size | Enforced in DOCX generation |
| Rate limiting | 30 requests/min per user |

## Files Changed

| File | Change |
|---|---|
| `frontend/app/api/poa/translate/route.ts` | Removed corrupted `addressPrompt`; refactored to LibreTranslate primary + Google fallback; added carrier-sentence retry + `isMostlyLatin()` quality gate |
| `frontend/app/client-dashboard/poa/page.tsx` | Added `wordAlignToCss()`, `normalizeSimplySignedPreview()`, fixed single-cell row skip in apostille preview |
| `frontend/app/client-dashboard/poa/poa.css` | Removed duplicated CSS; added screen justify rules for apostille Arabic column |
| `frontend/src/lib/poa-docx.ts` | Added title center detection for both apostille and simply-signed in `paragraphAlignment()` |
| `frontend/.env.local.example` | Added `LIBRETRANSLATE_URL` env variable |

## Verification

### Build
- Next.js production build: passed
- No new dependencies added
- No database changes

### T13A Verification Report (2026-11-25)

**Phase 1 — Configuration**
- `.env.local`: `LIBRETRANSLATE_URL=http://127.0.0.1:5000` configured for SSH tunnel dev access
- `.env.local.example`: `LIBRETRANSLATE_URL` and `GOOGLE_TRANSLATE_API_KEY` documented
- `route.ts`: LibreTranslate primary → Google Translate fallback, both server-only

**Phase 2 — SSH Tunnel + LibreTranslate**
- EC2 instance: `i-028aa5e8956fc8eb4` (`t3.small`, eu-north-1, IP 13.60.233.166)
- SSH tunnel: `ssh -L 5000:127.0.0.1:5000 ec2-user@13.60.233.166`
- LibreTranslate responds on `localhost:5000`, languages: en↔ar only (`LT_LOAD_ONLY=en,ar`)

**Phase 3 — Translation API**

| Test | Provider | Result | Notes |
|---|---|---|---|
| Name "John Smith" | LibreTranslate (direct) | PASS | "جون سميث" — correct transliteration |
| Name "Al-Mansour Intellectual Property Services LLC" | LibreTranslate (carrier) | PASS | Direct returned unchanged; carrier "I work at …" → "شركة المنصور لخدمات الملكية الفكرية" |
| Address "245 King Fahd Road, Al Olaya District, Riyadh 12214, Saudi Arabia" | LibreTranslate (carrier) | PASS | Direct returned unchanged; carrier "I live at …" → full Arabic address |
| Fallback quality gate | route.ts | PASS | `isMostlyLatin()` replaces strict `/[A-Za-z]/` — allows minor Latin in otherwise-Arabic text |
| Reverse translation (ar→en) | N/A | N/A | API is en→ar only — correct for POA |
| Storage separation | route.ts | PASS | Returns `{ arabic }` only, no DB writes, original text untouched |
| Rate limiting | route.ts | PASS | 30 req/min per user, in-memory map |
| Auth check | route.ts | PASS | Bearer token validated via Supabase `getUser()` |
| Cache headers | route.ts | PASS | `Cache-Control: private, no-store` |

**Phase 4 — POA Formatting**

| Check | Apostille | Simply Signed |
|---|---|---|
| Text direction | EN left LTR, AR right RTL | LTR locked |
| Body alignment | Justified (`w:jc val="both"`) | Justified |
| Title centered | PASS — both EN and AR titles | PASS (bold) |
| Signature fields | EN left-aligned, AR right-aligned | Left-aligned |
| Name/address/countries bold | PASS | N/A |
| Font: Times New Roman | PASS (all runs + doc defaults) | PASS |
| A4 page size | PASS (11906×16838 twips) | PASS |
| Language attributes | `en-US` / `ar-SA` | `en-US` |
| Number isolation | PASS (U+2066–U+2069 bidi isolates) | N/A |
| Preview CSS justify | PASS (`wordAlignToCss` maps `both`→`justify`) | PASS |
| Preview column swap | PASS (AR→right, EN→left) | N/A |
| Margins | 15.875mm 11.57mm 20.64mm 6.35mm | 3.175mm 7.62mm 1.588mm |

**Phase 5 — Auto-Translate Hook**

| Feature | Status |
|---|---|
| 500ms debounce | PASS |
| In-memory cache (per kind) | PASS |
| Manual edit mode | PASS |
| Re-translate button | PASS |
| Race condition protection (sequence ticket) | PASS |
| Abort on unmount/refire | PASS |
| Loading states (idle→pending→loading→idle/error) | PASS |
| Arabic service dictionary (10 services) | PASS |
| Arabic country overrides (12 entries) + Intl fallback | PASS |
| Arabic comma separator (U+060C) | PASS |

### 9. LibreTranslate returned proper nouns/addresses unchanged (CRITICAL)
**File:** `frontend/app/api/poa/translate/route.ts`

LibreTranslate's en→ar model returned proper nouns, company names, and comma-separated
addresses unchanged as English text. Examples:
- `"Al-Mansour Intellectual Property Services LLC"` → returned unchanged
- `"245 King Fahd Road, Al Olaya District, Riyadh 12214, Saudi Arabia"` → returned unchanged
- `"King Fahd Road"` alone → returned unchanged

The existing code correctly detected the Latin output via `/[A-Za-z]/.test()` and fell
through to Google Translate — but `GOOGLE_TRANSLATE_API_KEY` was not configured, so both
providers returned `null` → HTTP 502.

**Root cause:** LibreTranslate needs sentence context to transliterate proper nouns. When
given isolated names or addresses, the model echoes them back unchanged.

**Fix:** Added carrier-sentence retry strategy in `translateWithLibre()`:
1. Try direct translation first.
2. If the result is mostly Latin (unchanged), retry with a carrier sentence:
   - Names: `"I work at {text}"` → Arabic includes the transliterated name
   - Addresses: `"I live at {text}"` → Arabic includes the full translated address
3. Strip the known Arabic carrier prefix (`"أعمل في "` / `"أعيش في "`).
4. Accept the result if it is mostly Arabic.

Also replaced the strict `/[A-Za-z]/.test()` quality gate with `isMostlyLatin()` — a
proportional check (>40% Latin letters = reject). This allows legitimate Latin abbreviations
(LLC, LLP) in otherwise-Arabic translations.

**Test results (dev, 2026-11-25):**
- `POST /api/poa/translate` for name: **200 in ~7s** (direct fail + carrier retry)
- `POST /api/poa/translate` for address: **200 in ~1.5s** (direct fail + carrier retry)
- Both Arabic fields populated correctly in the browser.

### Known Limitations
1. LibreTranslate carrier-sentence retry adds ~3–5s latency for proper nouns (direct attempt fails, then carrier attempt succeeds). Simple common phrases translate on the first attempt (~1.5s).
2. PDF download requires Gotenberg (`GOTENBERG_URL`) — not yet deployed on EC2

### Requires User Action
1. Deploy to production: set `LIBRETRANSLATE_URL` in Amplify env vars pointing to EC2 Elastic IP
2. Security group: restrict port 5000 inbound to Amplify SSR IP ranges
3. Optional: deploy Gotenberg on same EC2 for PDF conversion
4. Optional: reserve EC2 instance (1-year) to reduce cost from ~$17.70 to ~$10.90/month

## Implementation Status

### Code changes (done)
- `route.ts` refactored: `translateWithLibre()` tries first, `translateWithGoogle()` as fallback
- Both return `null` on failure, allowing seamless fallback
- If `LIBRETRANSLATE_URL` is not set, LibreTranslate is skipped (Google-only mode)
- If neither is configured, returns `translation_failed` 502
- Rate limiting, auth, digit preservation all unchanged
- `translateWithLibre()` now uses carrier-sentence retry for proper nouns/addresses (2026-11-25)
- `isMostlyLatin()` replaces strict `/[A-Za-z]/` check — proportional gate (>40% Latin = reject)
- No Google API key required — LibreTranslate handles all POA translations via carrier strategy

### EC2 setup (manual, pending)
Owner must complete these steps from AWS console:

1. Launch `t3.small` in eu-north-1, Ubuntu 22.04 LTS, 8 GB gp3
2. Allocate Elastic IP and associate
3. Security group: SSH (22) from owner IP, port 5000+3000 restricted
4. Install Docker and run docker-compose (see setup section below)
5. Add `LIBRETRANSLATE_URL=http://<elastic-ip>:5000` to Amplify env vars
6. Add `GOTENBERG_URL=http://<elastic-ip>:3000` to Amplify env vars
7. Test translation from live app, verify fallback works

---

## AWS Infrastructure Audit: LibreTranslate Deployment Options

### Phase 1 — Existing Infrastructure Discovered

| Resource | Status | Details |
|---|---|---|
| AWS Amplify | Active | Hosts Next.js frontend, auto-deploys on push, CloudFront CDN |
| Supabase | Active | PostgreSQL + Auth + Realtime + Storage + Edge Functions (ap-southeast-2) |
| AWS S3 | Active | Private document storage (signed URLs) |
| EC2 instances | **None** | No self-managed servers found |
| ECS / ECR | **None** | No container infrastructure |
| Docker | **None** | No Docker hosts anywhere |
| Lambda | **None** | No custom Lambda functions |
| Load balancer | **None** | No ALB/NLB provisioned |
| VPC (custom) | **None confirmed** | Amplify uses AWS-managed networking, not a user VPC |

**Source**: `docs/performance-audit-2026-10-17.md` line 8: *"No self-managed web servers, containers, or Lambda targets were found."* Line 66: *"No load balancer was provisioned … the measured app hosting is managed Amplify plus Supabase Edge Functions."*

**GOTENBERG_URL** in `.env.local.example` suggests Gotenberg (PDF converter) may also need a server — this could share the same EC2 as LibreTranslate.

**AWS CLI**: Not installed on this machine. Findings are based on project documentation, code, and infrastructure references. A live `aws ec2 describe-instances` would confirm zero running instances.

### Phase 2 — Resource Suitability

**Can LibreTranslate run on existing infrastructure?**

| Option | Verdict | Reason |
|---|---|---|
| Amplify (SSR) | No | Amplify runs Next.js as serverless/managed compute. Cannot run a persistent Docker container or sidecar process. No VPC access to a private port. |
| Supabase Edge Functions | No | Deno runtime, 50s timeout, 150MB memory limit. LibreTranslate needs ~1.5 GB RAM and a persistent process. |
| Existing EC2 | N/A | No EC2 instances exist to piggyback on. |
| Existing ECS/ECR | N/A | No container infrastructure exists. |
| RDS server | Excluded | Per requirements — never install application services on a database server. |

**Conclusion: There is no existing compute resource that can host LibreTranslate. A new EC2 instance is required.**

### Phase 3 — Cost Analysis

#### Option A: New EC2 `t3.micro` (2 vCPU, 1 GB RAM) — LibreTranslate only en+ar

| Item | Cost |
|---|---|
| `t3.micro` on-demand (eu-north-1) | ~$8.50/month |
| `t3.micro` 1-year reserved | ~$5.10/month |
| EBS gp3 8 GB | ~$0.70/month |
| Data transfer (< 1 GB/month for translation) | ~$0 |
| **Total on-demand** | **~$9.20/month** |
| **Total reserved** | **~$5.80/month** |

Risk: `t3.micro` has only 1 GB RAM. LibreTranslate with `LT_LOAD_ONLY=en,ar` uses ~800 MB–1.2 GB. Tight but workable with swap. Translation may be slow (~2–4s per request).

#### Option B: New EC2 `t3.small` (2 vCPU, 2 GB RAM) — Recommended minimum

| Item | Cost |
|---|---|
| `t3.small` on-demand (eu-north-1) | ~$17/month |
| `t3.small` 1-year reserved | ~$10.20/month |
| EBS gp3 8 GB | ~$0.70/month |
| **Total on-demand** | **~$17.70/month** |
| **Total reserved** | **~$10.90/month** |

Comfortable headroom. Translation in ~1–2s. Can also host Gotenberg for PDF conversion on the same instance.

#### Option C: New EC2 `t3.medium` (2 vCPU, 4 GB RAM) — Original suggestion

| Item | Cost |
|---|---|
| `t3.medium` on-demand (eu-north-1) | ~$34/month |
| `t3.medium` 1-year reserved | ~$20.40/month |
| EBS gp3 8 GB | ~$0.70/month |
| **Total on-demand** | **~$34.70/month** |
| **Total reserved** | **~$21.10/month** |

Overkill for translation-only. Worth it only if hosting both LibreTranslate + Gotenberg + future services.

#### Option D: Continue using Google Translate API

| Item | Cost |
|---|---|
| Google Translate v2 (first 500K chars/month free) | $0 |
| Overage: $20 per million characters | ~$0–$5/month at typical POA usage |
| No infrastructure to maintain | $0 |
| **Total** | **~$0–$5/month** |

Cheapest option. Already working (after the prompt bug fix). No server to maintain.

### Phase 4 — Security Requirements

Any EC2-based solution must satisfy:

| Requirement | Implementation |
|---|---|
| Translation service private | Security group: port 5000 inbound from EC2's own IP only (localhost) or Amplify SSR origin |
| No public port 5000 | Security group allows SSH (port 22) from your IP only; port 5000 only internal |
| Existing SG rules preserved | New security group, never modify existing ones |
| No RDS/S3 policy changes | EC2 has no access to RDS or S3 |
| Credentials server-side | `LIBRETRANSLATE_URL` is a server-only env var (no `NEXT_PUBLIC_` prefix) |
| Rate limiting preserved | Existing 30/min per user limit in `route.ts` stays unchanged |
| Original text preserved | Only Arabic output stored separately — no change to data model |
| Google Translate fallback | Keep `GOOGLE_TRANSLATE_API_KEY` as fallback until LibreTranslate is verified |

**Network concern**: AWS Amplify SSR runs as managed compute — it does NOT have private VPC access to an EC2 by default. The Next.js API route (`/api/poa/translate`) would need to reach LibreTranslate over the **public internet** (EC2 public IP or Elastic IP with restricted security group), or you would need to set up a VPC endpoint / API Gateway. This is different from a traditional VPC-to-VPC setup.

### Phase 5 — Final Recommendation

#### Recommended: Option B — `t3.small` (dual-purpose: LibreTranslate + Gotenberg)

**Why `t3.small` over `t3.micro`:**
- 2 GB RAM gives comfortable headroom for both LibreTranslate (~1.2 GB) and Gotenberg (~200 MB)
- Solves two problems at once: POA translation AND POA PDF conversion
- ~$10.90/month reserved vs paying for two separate APIs

**Architecture:**

```
Client browser
  → /api/poa/translate (Next.js on Amplify)
    → https://<ec2-elastic-ip>:5000/translate (LibreTranslate, restricted SG)

  → /api/poa/pdf (Next.js on Amplify)
    → https://<ec2-elastic-ip>:3000/forms/libreoffice/convert (Gotenberg, restricted SG)
```

**EC2 Setup (eu-north-1):**

```bash
# 1. Launch t3.small, Ubuntu 22.04 LTS, 8 GB gp3 EBS
# 2. Allocate Elastic IP and associate
# 3. Security group:
#    - SSH (22) from your IP only
#    - Port 5000 (LibreTranslate) from Amplify SSR IP ranges only
#    - Port 3000 (Gotenberg) from Amplify SSR IP ranges only
#    - All other inbound: DENY

# 4. Install and run:
sudo apt update && sudo apt install -y docker.io docker-compose
sudo systemctl enable docker

# docker-compose.yml
cat <<'EOF' > docker-compose.yml
version: "3.8"
services:
  libretranslate:
    image: libretranslate/libretranslate
    ports: ["5000:5000"]
    environment:
      LT_LOAD_ONLY: en,ar
      LT_CHAR_LIMIT: "500"
      LT_DISABLE_WEB_UI: "true"
    restart: unless-stopped
    mem_limit: 1400m

  gotenberg:
    image: gotenberg/gotenberg:8
    ports: ["3000:3000"]
    command: ["gotenberg", "--api-timeout=60s"]
    restart: unless-stopped
    mem_limit: 400m
EOF

sudo docker compose up -d
```

**Amplify environment variables** (after verification):
```
LIBRETRANSLATE_URL=http://<elastic-ip>:5000
GOTENBERG_URL=http://<elastic-ip>:3000
```

**Code change** in `frontend/app/api/poa/translate/route.ts`:

```ts
// Primary: LibreTranslate (self-hosted). Fallback: Google Translate.
const libreUrl = process.env.LIBRETRANSLATE_URL;
const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;

async function translateWithLibre(text: string): Promise<string | null> {
  if (!libreUrl) return null;
  try {
    const res = await fetch(`${libreUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: 'ar' }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => ({}));
    return typeof body.translatedText === 'string' ? body.translatedText : null;
  } catch { return null; }
}

async function translateWithGoogle(text: string): Promise<string | null> {
  if (!googleKey) return null;
  try {
    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(googleKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'en', target: 'ar', format: 'text' }),
        signal: AbortSignal.timeout(8000), cache: 'no-store' },
    );
    const body = await res.json().catch(() => ({}));
    return body.data?.translations?.[0]?.translatedText ?? null;
  } catch { return null; }
}
```

Then in the POST handler, replace the current Google Translate block with:
```ts
const raw = await translateWithLibre(text.trim()) ?? await translateWithGoogle(text.trim());
if (typeof raw !== 'string')
  return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
const arabic = cleanTranslation(raw, text);
if (!arabic || /[A-Za-z]/.test(arabic))
  return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
return NextResponse.json({ arabic }, { headers: { 'Cache-Control': 'private, no-store' } });
```

**Estimated monthly cost:** ~$10.90 (1-year reserved) or ~$17.70 (on-demand)

**Risks and rollback:**
- If LibreTranslate goes down → automatic fallback to Google Translate (no downtime)
- If EC2 needs replacement → `docker-compose up -d` on a new instance, update Elastic IP
- Rollback: remove `LIBRETRANSLATE_URL` env var → app falls back to Google Translate immediately

### Decision needed from owner

1. **Approve EC2 creation**: `t3.small` in eu-north-1 (~$10.90–$17.70/month)
2. **Confirm dual-purpose**: host both LibreTranslate + Gotenberg on the same instance?
3. **Confirm region**: eu-north-1 (Stockholm) to match Amplify?
4. **Security group IP restriction**: provide the Amplify SSR outbound IP ranges, or use API key auth instead?
5. **Keep Google Translate as fallback**: recommended until LibreTranslate is verified in production
