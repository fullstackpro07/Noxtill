# Agent Instructions — Noxtill

This file is for any coding agent (Claude Code, Antigravity, or otherwise) working in this
repository. Read it in full before touching code. It captures the working doctrine and codebase
conventions established over the Reports and Settings module redesigns — follow the same
discipline for every module you touch next.

## 0. Repo shape

- `backend/` — NestJS + Prisma, MySQL. `npm run start:dev` (port 5000, base path `/api/v1`).
- `frontend/` — Next.js App Router, React Query + zustand. `npm run dev` (port 3000).
- `docs/Noxtill master theme overview/*.dc.html` — pixel-accurate reference designs, one file per
  module. `Noxtill Design System.dc.html` is tokens/patterns reference, not a page to implement.
- `docs/DATABASE.md` — MySQL-specific gotchas (read before writing any raw SQL).
- `docs/PROJECT_PLAN_V2.md` — the 24-module/190-screen spec and ticket history. Check it before
  assuming something is "missing" — roughly half of an earlier gap-audit turned out to already be
  built under a different module folder than expected.

## 1. The non-negotiable doctrine

This is the standard the Reports and Settings modules were held to, verified by two separate
deep-audit passes each. Every module handed to you gets the same standard, no exceptions:

1. **Read the whole `.dc.html` design file before writing any code.** Extract exact layout,
   copy, spacing, states, empty states, and every card/table/filter/button it shows.
2. **Implement pixel-perfect** against that file, using this codebase's existing design tokens
   (`frontend/src/app/(app)/app-theme.css` — do not introduce a new palette; this is a visual
   match within the existing theme, not a rebrand).
3. **Wire every element to real backend data.** If the design shows a number, a list, a chip, or
   a status — it must come from a real Prisma query or a real computation over real rows. Reusing
   an existing working endpoint is preferred over inventing a new one; only build new backend
   where the design genuinely needs data nothing currently exposes.
4. **Never fabricate.** No hardcoded placeholder numbers, no `Math.random()` demo data, no static
   string standing in for something that should be computed. If a design element has no real data
   source and building one is out of scope, do not silently invent a number — see rule 5.
5. **Disclose what's genuinely unsupported**, honestly, in the UI copy itself: `"Not tracked"`,
   `"Not available"`, `"Not configured"` are all fine — a lie dressed as data is not. When you
   write one of these, you must have actually verified (grep the codebase) that the capability
   really doesn't exist — don't guess.
6. **Don't leave stale claims when you make something real.** If a design element already exists
   elsewhere in the app as a hardcoded "not configured" row and you just built the real feature,
   go find every other place that claims otherwise and fix it too. (A real bug that shipped once:
   Settings' Payments screen kept saying "refund limit: not configured" after the real refund
   limit was built and shown correctly on the Sales screen — two screens disagreeing about the
   same fact. Grep for the feature name/description text across the whole `settings-hub`
   category files, not just the one category you're editing, before calling a feature done.)
7. **Don't break existing working data/API wiring.** For an existing module being redesigned,
   this is a visual layer swap: extract the current page's hooks/queries/mutations first, keep
   them, only replace the JSX/styling around them.

## 2. Definition of done (verify ALL of these before saying a module is finished)

1. `cd backend && npx tsc --noEmit` — clean.
2. `cd frontend && npx tsc --noEmit` — clean.
3. `cd backend && npx jest` — full suite green (not just the files you touched — you can break
   something in a shared util). Expect ~240 suites / ~1500 tests; note the baseline pass count
   before you start so you can tell a real regression from a pre-existing flake.
4. `cd frontend && npx eslint <files you touched>` and `cd backend && npx eslint <files you
   touched>` — no new errors (formatting-only `prettier/prettier` noise on files that already had
   it before you touched them is not your problem to fix; don't reformat unrelated code).
5. Start both dev servers, log in with a real account, and **visually verify the live page**
   against the `.dc.html` reference (a screenshot tool — Puppeteer or equivalent — beats eyeballing
   dev-server output). Check the browser console and network tab for errors.
6. **Re-audit for fabrication** after building: grep your new category/view files for any
   hardcoded `state: () => ({ value: '...' })`-shaped static claim and, for every one, find the
   real code path that makes it true. If you can't find one, it's a bug — fix it or make the
   claim honest.
7. Report back exactly what's real vs. honestly disclosed as unsupported — never claim "fully
   wired" if you didn't check.

## 3. Backend conventions (read before writing NestJS code here)

**Tenancy — this is the #1 thing to get right.** There is no `JwtAuthGuard`/`TenantGuard`/
`CurrentTenant` decorator to import per-controller — those don't exist in this codebase (a stale
set of `src/ads/*` files imported them and broke the build; see the fix in that same commit as a
worked example of the correct pattern). Auth, tenancy, and capability checks are **global**,
registered once in `backend/src/common/common.module.ts` via `APP_GUARD`:
`BusinessThrottlerGuard` → `JwtAuthGuard` (`common/guards/jwt-auth.guard.ts`) → `TenancyGuard` →
`CapabilitiesGuard`. A controller never needs `@UseGuards(...)` for auth. Get the current user
with `@CurrentUser() user: AuthenticatedUser` (`common/decorators/current-user.decorator.ts`),
which gives you `user.businessId`, `user.sub`, `user.role`, etc. Inside a service, prefer
`TenantPrismaService` (auto-scopes every query to the CLS-bound business id) over raw
`PrismaService` unless you have a specific reason (a public/unauthenticated route, a background
job with no request context) — those cases use `PrismaService` directly with an explicit
`businessId` param, same pattern as `public-ordering.service.ts` or `SocialInboxService.ingest()`.

**Capabilities.** Permission gates are `CAPABILITIES.X` constants
(`common/capabilities/capabilities.constants.ts`) enforced via `@RequireCapability(...)`
(`common/decorators/require-capability.decorator.ts`) on a controller route, or
`PoliciesService.actorCan(capability)` inside a service for a conditional check. Owner always
passes every capability check — never gate the owner out.

**Errors.** Throw `AppException(code, message, HttpStatus)` (`common/filters/app.exception.ts`)
for typed domain errors — never a bare `throw new Error(...)` or `BadRequestException` for
something the frontend needs to branch on by code.

**Business-tunable settings.** If a design shows a limit/toggle the owner should be able to
configure (a cap, a window, a restriction), it likely belongs in the `Business.policies` JSON
column — see `common/policies/policies.constants.ts` (`POLICY_DEFS`) and
`common/policies/policies.service.ts` (`PoliciesService`/`ResolvedPolicies`/`resolvePolicies`).
Add a typed key there with a default that preserves current behavior, consume it via
`policies.bool()/num()/time()`, and surface it as a real editable row in the relevant
`settings-hub` category (see `backend/src/settings-hub/categories/policy-rows.ts`'s `policyRow()`
helper — reuse it, don't hand-roll another settings row shape).

**MySQL, not Postgres.** Read `docs/DATABASE.md` fully before writing raw SQL. Sharp edges that
have bitten every past pass:
- `$queryRaw` aggregates over an `Int` column (`MAX()+1`, `COUNT()`) come back as JS `bigint`, not
  `number` — `Number(...)`-coerce before a Prisma `Int` write or it throws.
- Raw-SQL `Boolean` columns come back as JS `number` (0/1) — coerce explicitly.
- No `ORDER BY` means genuinely undefined row order on InnoDB — always add one.
- FULLTEXT boolean-mode `AND` (`requireAll=true` in `mysql-fulltext.util.ts`) returns zero rows if
  any single word is missing — use OR (`requireAll=false`) for natural-language search.
- Don't trust `npx prisma migrate dev`'s auto-diff on this local setup — it has twice proposed
  dropping legitimate indexes that weren't actually wrong (shadow-DB artifact). Verify the live
  DB's real state via `information_schema` before applying a generated diff; when in doubt,
  hand-write the migration SQL and apply via `prisma db execute` +
  `prisma migrate resolve --applied`.

**Testing.** Integration-style Jest specs run against the real local MySQL DB (not mocked) — see
any `*.service.spec.ts` for the pattern: a `FakeClsService` stub, `new PrismaService()` +
`new TenantPrismaService(prisma, cls)`, real `prisma.business.create()`/`prisma.user.create()` in
`beforeAll`, real cleanup in `afterAll`. Follow this pattern for new specs rather than mocking
Prisma — mocked-DB tests have previously passed while the real migration was broken.

## 4. Frontend conventions

**API calls.** Every request goes through `lib/api-client.ts`'s `apiFetch<T>()` (bearer auth,
`X-Branch` header, 401-refresh-retry). Put typed fetch functions in a per-domain `lib/<domain>-api.ts`
file, consumed via `@tanstack/react-query` in the view component. Don't call `fetch()` directly
in a component.

**Module header.** The Topbar is one shared component; a module customizes it by calling
`useModuleHeader({ title, subtitle, search, stats, actions })`
(`components/layout/module-header-context.tsx`) from its layout/page. **Important**: the Topbar
renders outside a module's own component tree, so any interactive state those header controls
need (a save button, a search box, staged changes) cannot live in local component state or React
context scoped to the page — it will not be reachable from the Topbar. Use a zustand store scoped
to that module instead (see `components/settings-hub/hub-store.ts` or the reports equivalent for
the pattern) — this bit a previous pass with a `"useReports must be used inside ReportsProvider"`
crash before the fix.

**Styling.** Match `app-theme.css` tokens; this is a within-theme pixel-match against the `.dc.html`
file, not a redesign of the palette.

## 5. Per-module workflow (repeat for each module)

1. Read `docs/Noxtill master theme overview/Noxtill <Module>.dc.html` in full.
2. Find the module's current frontend route (`frontend/src/app/(app)/<route>/`) and its feature
   view component under `components/<domain>/`. List every hook/query/mutation it already calls —
   this is what you must keep working.
3. Grep the backend for what real data already exists for each card/table the design shows
   (`backend/src/<domain>/*.service.ts`, `schema.prisma`). Don't assume something is missing —
   check `docs/PROJECT_PLAN_V2.md` and the real files first.
4. For anything the design shows with no real backend behind it: decide whether it's small enough
   to build for real (preferred) or must be honestly disclosed as unsupported. Never fabricate.
5. Rebuild the JSX pixel-for-pixel against the design, re-wiring the same hooks/handlers.
6. Run the full "definition of done" checklist in §2.
7. Report exactly what's real, what you built new (and where), and what's honestly disclosed as
   unsupported and why.

## 6. Remaining modules to implement, in suggested order

Reports and Settings are done (both audited twice for fabrication — treat their `settings-hub/`
backend structure and `components/settings-hub/` frontend structure as the reference quality bar).

| Design file | Frontend route |
|---|---|
| `Noxtill Dashboard.dc.html` | `dashboard` |
| `Noxtill Fast Sale.dc.html` | `sales` |
| `Noxtill Orders.dc.html` | `orders` |
| `Noxtill Products.dc.html` | `products` |
| `Noxtill Bookings.dc.html` | `bookings` |
| `Noxtill Staff.dc.html` | `staff` |
| `Noxtill Branches.dc.html` | `branches` |
| `Noxtill Reviews.dc.html` | `reviews` |
| `Noxtill Profit Analytics.dc.html` | `profit` |
| `Noxtill Integrations.dc.html` | `integrations` |
| `Noxtill Business Listings.dc.html` | `listings` |
| `Noxtill AI Phone.dc.html` | `receptionist` |
| `Noxtill Photo Digitizer.dc.html` | `digitizer` |

Modules with no design file yet (leave on current visual design; don't rebuild speculatively):
`inventory`, `customers`, `credit`, `marketing`, `assistant`, `social`, `advertising`,
`competitive`, `deliveries`, `expenses`, `business-brain`, `unified-inbox`.

## 7. Do not

- Don't invent a new color palette or restyle the sidebar/shell — that was a separate, since-
  superseded plan; the live convention is a pixel-match within the existing theme.
- Don't add `@UseGuards(...)` to a controller, or import `JwtAuthGuard`/`TenantGuard`/
  `CurrentTenant` — they don't exist; see §3.
- Don't run `git push`, force-push, `git reset --hard`, or any destructive git operation without
  explicit sign-off. Don't `git commit` unless asked to.
- Don't run `prisma migrate dev`'s auto-diff and apply it blindly.
- Don't mark a module "done" without actually running the checklist in §2 and re-grepping for
  fabricated static claims afterward — that second pass has found real bugs every single time
  it's been done so far.
