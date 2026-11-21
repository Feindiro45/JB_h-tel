# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project and current state

JB Hôtel is a web app for managing rooms, reservations and the cash desk at a hotel in the Central African Republic. V1 has no public site and no online payment. All specs, docs and user-facing text are in **French**.

- **Progress tracker: `CHECK_LEVEL.md`.** The user asked for it to show what is done and what remains. **Update it whenever an item is finished or its status changes**, and update `docs/CHANGELOG.md` too.
- `docs/06_PROMPT_AGENT_IA_IMPLEMENTATION.md` is the master brief. It sets the mandatory phases 0–8 (work through them in order), the acceptance criteria and the collaboration rules. The other numbered files in `docs/` (01–05, 07–09) are the authoritative specs.
- `docs/DECISIONS.md` records arbitrations (C-xx) and decisions (D-xx). `docs/QUESTIONS.md` lists the open business questions (Q-xx) for the hotel. Cite these IDs in code comments when you implement a provisional rule.
- `docs/archive/JB_Hotel_conception_V2.zip` is an outdated V2 of docs 01–04. Ignore it.
- Phases 0 and 1 are done: audit, scaffolding, error contract, health endpoint, CI. Phase 2 (database schema, Identity module, audit trail) is done. Phase 3 (RoomCatalog: room types, rooms, versioned rates) is done. Phase 4 (Customers and Reservations) is done. Phase 5A (Cashier: payments, receipts, refunds) is done. Phase 5B (Billing: frozen invoices, PDF A4, credit notes), 5C (QR code with public verification) and 5D (email notifications) are done. Phase 6A (frontend: login, shell, dashboard, reservations, planning, customers) and 6B (cash desk, documents, printable receipt) are done; 6C (admin screens), 6D (filters/pagination) and 7 (financial reports with CSV/PDF) are done. Local quality checks pass: 234 backend tests, 118 frontend tests and 9 browser scenarios (including 2 real E2E paths, the error pages (D-060) and the 80 mm thermal ticket (D-061)). New work from the `new/` folder (80 mm ticket, offline mode, admin "Mode hors ligne" module) is tracked in `SUIVI_NEW.md`; D-062 makes a single admin-designated main cash desk the only writer of reservations and payments. D-053 to D-060 are done (cancellation and extension money, mail delivery, overdue alerts, sidebar collapse, corrections and deletions, access pages, error pages and settings design). CHECK_LEVEL.md records the remaining hotel approval, SMTP, paper printing and remote MySQL 8.4 CI checks.
- `RAPPORT.md` at the root is the latest session report for the user, written in French. Rewrite it at the end of each autonomous work session.
- **Every route and link uses UUIDs (D-026, a user requirement).**
  - Models use `App\Shared\Models\HasPublicUuid`; the entity tables already have a `uuid` column.
  - Resources expose `'id' => $this->uuid` and never the integer key.
  - Request payloads reference other entities by UUID: for example `room_type_id` holds a UUID, validated with `['uuid', Rule::exists('table', 'uuid')]` and resolved to the internal id in `toData()`.
  - Frontend routes use `/…/:id` with the UUID.
  - Integer keys stay internal: foreign keys, joins, cross-module contracts, audit.
  - Roles are addressed by their code (`admin`, `caissiere`).
- `docs/SCHEMA.md` describes the actual database schema and how it differs from `09_schema_reference.sql`. Update it with every migration.

## Commands

Local environment: XAMPP gives PHP 8.2 (hence Laravel 12) and **MariaDB 10.4** on port 3306, user `root` with no password. Databases: `jb_hotel` for dev, `jb_hotel_test` for tests. MySQL 8 and Docker are not installed on this machine; the CI tests against MySQL 8.4.

Backend, from `backend/`:
- Serve: `php artisan serve` → http://localhost:8000. Health check: `GET /api/v1/health`.
- Reset the dev database: `php artisan migrate:fresh --seed`. It creates the demo users `admin@jbhotel.local` and `caissiere@jbhotel.local`; their password comes from `DEMO_USERS_PASSWORD` or is printed during the seed. Create a production admin with `php artisan jb:create-admin`.
- Run tests: `php artisan test`. Tests use MySQL/MariaDB `jb_hotel_test`, never SQLite (set in `phpunit.xml`), because locking and constraints must be tested on the real engine.
- Run one test: `php artisan test --filter=ErrorContractTest` for a class, or `--filter=test_method_name` for a method.
- Check format: `composer lint` (`pint --test`). Apply format: `composer format`.
- Static analysis: `composer analyse` (Larastan, level 6, `phpstan.neon`).

Frontend, from `frontend/`:
- Serve: `npm run dev` → http://localhost:5173.
- Run tests: `npm test` (Vitest, jsdom).
- Run one file: `npx vitest run src/shared/api/errors.test.ts`. Run tests by name: `npx vitest run -t "nom du test"`.
- Lint: `npm run lint` (oxlint). Format: `npm run format`, or `npm run format:check` to only check (Prettier: no semicolons, single quotes, width 100).
- Type check: `npm run typecheck` (`tsc -b`, TypeScript 7). Production build: `npm run build`.

The CI workflow (`.github/workflows/ci.yml`) runs all of these. Run them before declaring a phase done.

## Reading the specs: precedence

Every doc ends with the same two appended sections: **"Règles validées : demi-journée, validation et messages"** and **"Décisions confirmées V6"**. They are the latest decisions. They override older text in the same doc, which was not updated to match:

- Database: **MySQL 8+ InnoDB, utf8mb4** only. Ignore "MySQL ou PostgreSQL" in 02 and 06.
- Half-day (demi-journée): a flat rate for any positive duration up to and **including 12 h**. This replaces the 06 warning against hard-coding 12 h. Past 12 h, the app raises an alert, and the cashier must explicitly approve the extension and its surcharge. That approval comes after an availability-conflict check and must show the proposed surcharge. It logs the author, date, old amount and new amount. The app never converts a stay to a day rate automatically.
- Roles and permissions: `spatie/laravel-permission`, not Spark. The `users.role` column in the SQL and the MCD predates this choice. Reconcile the two and record the arbitration in `docs/DECISIONS.md`.
- Customer record: last name (nom), first names (prénoms), phone, email, city and country of origin, address, and an ID document when needed. Collect as little personal data as possible. The SQL in 09 has these columns; doc 02 does not.

**Still open. Do not invent these rules:**
- what a "journée" (day) covers, and the rounding rules;
- which period is blocked when no time is entered. Until this is decided, apply an explicit, tested, conservative policy and flag ambiguous reservations to the user;
- the invoicing and tax rules that apply in CAR, including credit notes;
- the confirmation rules for unpaid reservations;
- the refund conditions.

The provisional policies for these points live in `docs/DECISIONS.md`. Examples: D-009, the conservative policy when no time is entered (block from 00:00 of the start date to the end of the end date); D-014, no overpayment; D-016, a 10 % cashier discount cap. Provisional values must be configurable and clearly labeled as provisional, never presented as validated rules. Record any new arbitration in `docs/DECISIONS.md`.

## Target architecture

Repository layout: `backend/` (Laravel REST API), `frontend/` (React + TypeScript + Vite), `docs/`, `infra/` (Docker Compose with MySQL 8.4, not yet tested locally), `README.md`, `CHECK_LEVEL.md`, and `.env.example` files with no secrets (root, backend, frontend). The backend and frontend are separate apps that start independently. They talk through a versioned API under `/api/v1/...`, with CORS configured.

### Backend: Laravel modular monolith (no microservices)

The modules are `app/Modules/{Identity,Customers,RoomCatalog,Reservations,Cashier,Billing,Reporting}`, plus `app/Shared/{Contracts,Exceptions,ValueObjects}`. A module creates only the layers it actually needs, picked from: `Http/Controllers`, `Http/Requests`, `DTO`, `Application/Services`, `Domain/Contracts`, `Infrastructure/Repositories`, `Models`, `Policies`, `Events` and `Listeners`.

- Controllers stay thin. They validate with a FormRequest, build a typed DTO and hand off to a service, with one service per use case. Eloquent models stay in the persistence layer.
- Modules depend on small interfaces bound in service providers, such as `RoomAvailability`/`AvailabilityChecker`, `CurrentPriceProvider`/`PriceProvider` and `PaymentRecorder`. No module reads another module's tables, and circular dependencies are forbidden.
- Cashier receives a reservation id and the amount due through a read contract. It records its own payments. Billing freezes lines and amounts taken from reservations and payments. Reporting only reads, through projections or dedicated queries.
- Domain events fire after the transaction commits: `ReservationConfirmed`, `PaymentRecorded` and `InvoiceIssued`.
- Pricing uses a strategy per billing unit (half-day, day) so new units can be added.
- Supporting choices: Sanctum or equivalent for auth, role-based access through policies, rate limiting, and PHPUnit or Pest for tests. Invoice PDFs are generated on the server, which is the source of truth.

The reference schema is `docs/09_schema_reference.sql`, which matches the MCD in `docs/04_MCD_JB_Hotel.drawio`. Keep the migrations aligned with both. The SQL is incomplete (see C-05): it has no Spatie tables, no timestamps, and nothing to store the discount caps, settings, reservation change history or actual arrival and departure times. The `users.role` column is dropped in favour of Spatie (D-006).

Code that already exists:
- **Error contract.** `bootstrap/app.php` registers `App\Shared\Exceptions\ApiExceptionRenderer` for `api/*` and JSON requests. Every error becomes `{title, message, errors?, code?}` in French, with the texts in `App\Shared\Exceptions\ErrorMessages`. No trace leaks, even with `APP_DEBUG=true`.
- **Business errors.** Throw `App\Shared\Exceptions\BusinessRuleException` (or a module subclass) with a French title and message, an HTTP status (409 for conflicts) and a stable `code`.
- **Routing.** All business routes go inside the `Route::prefix('v1')` group in `routes/api.php`, which applies `throttle:api` (120/min, defined in `AppServiceProvider`). CORS origins come from `FRONTEND_URL` (comma-separated) with credentials enabled. Sanctum SPA cookie auth (D-005) is wired up through `$middleware->statefulApi()` in `bootstrap/app.php`: the frontend calls `GET /sanctum/csrf-cookie`, then `POST /api/v1/auth/login`.
- **Settings.** The app timezone comes from `APP_TIMEZONE`, default `Africa/Bangui`, and the locale is `fr`. French validation messages come from `lang/fr/` (laravel-lang). `Model::shouldBeStrict()` is on outside production.
- **MariaDB/MySQL compatibility (D-002).** Avoid features that only one of the two engines has: `SKIP LOCKED`, JSON path indexes, generated JSON columns, and anything specific to MariaDB.
- **Schema.** Every table already exists: the migrations in `database/migrations/2026_11_19_14*` cover customers, the room catalogue, reservations, cashier and billing, `audit_logs` and `settings`. Phases 3–5 add Eloquent models and services on top; they do not create tables. Write `CHECK` constraints with `DB::statement('ALTER TABLE … ADD CONSTRAINT chk_… CHECK (…)')`, and never on a foreign-key column (MySQL forbids that when the key has a referential action). Use `DATETIME` (`$table->datetimes()`), not `TIMESTAMP`. Foreign keys are always `restrictOnDelete()`.
- **Module layout.** Follow the Identity module: `app/Modules/Identity/{Domain,DTO,Application/Services,Http/{Controllers,Requests,Resources,Middleware},Models,Policies,Console}` plus an `IdentityServiceProvider`. Register each provider in `bootstrap/providers.php`. Load each module's `Http/routes.php` with `require` inside the v1 group of `routes/api.php`. Wrap protected routes in the `authenticated` middleware group (auth:sanctum + `EnsureUserIsActive`), then authorize with `->can()` and a policy, or with the Spatie `permission:` middleware. The ability names are the `PermissionName` enum values.
- **User model.** It lives at `App\Modules\Identity\Models\User` (not `App\Models`). Use `primaryRole()`, not `role()`: a method named `role()` would shadow Spatie's `role()` query scope. Roles are in the `RoleName` enum, `admin` and `caissiere`. Never delete a user; deactivate it.
- **Audit.** Inject `App\Shared\Contracts\AuditTrail` and call `record()` inside the same `DB::transaction` as the change. Pass before and after snapshots, never secrets.
- **Cross-module contracts.** A module's public API lives in `app/Modules/<Module>/Contracts` (interfaces, readonly DTOs, shared enums), and other modules import only from there. Example: Reservations uses `RoomCatalog\Contracts\CurrentPriceProvider::currentRate($roomTypeId, BillingUnit, ?$at)`, which returns the version active **at confirmation time** and throws `rate_not_defined` (409). It also uses `RoomDirectory::find`/`findByUuid`, which return a `RoomSnapshot` with capacity and maintenance status. Implementations live in `Infrastructure/` and are bound in the module's service provider.
- **Rates (D-027).** Never update `room_rates.amount_fcfa`. `RateService::publish` closes the previous version and keeps the chain contiguous; `withdraw` only removes a version that is still scheduled.
- **Strict mode.** Give nullable columns that resources read a default in the model's `$attributes`, otherwise freshly created models throw `MissingAttributeException`. Eager-load the relations a resource reads.
- **Reservations (phase 4).**
  - *Services.* `ReservationQuoter` computes everything (period, capacity, half-day rule, current rate, discount authorization, conflicts) and writes nothing. `ReservationBookingService` (create, confirm), `ReservationLifecycleService` (check-in, check-out, cancel, occupants) and `ReservationExtensionService` (preview, extend) each run in a transaction that first calls `RoomDirectory::lockForReservation()` to lock the room row, then re-checks conflicts.
  - *Blocking interval.* `BlockedPeriod::fromStay()` builds the `[blocked_from, blocked_until[` interval. The blocking statuses are PENDING, CONFIRMED and IN_PROGRESS (`ReservationStatus::blockingValues()`).
  - *Money.* `PriceCalculator` and `Discount` (percentages in basis points) do integer FCFA math only.
  - *Billing units.* Duration rules are strategies in `Domain/Billing` (`HalfDayPolicy` reads `billing.half_day_max_hours`); new units go there.
  - *Reading.* Occupancy and availability are computed in `Application/Queries/RoomOccupancy`, never stored. JSON goes through `Http/ReservationPresenter`, which loads rooms and customers via the directories. Use `BusinessRuleException` `details` for correction hints (conflicts, supplement).
  - *Tests.* Reservation tests use `tests/Concerns/BuildsHotel`: rooms 101 VIP and 102 Standard with demo rates, time frozen at 2026-12-01 10:00 Bangui. `ConcurrencyTest` runs real PHP processes (`tests/Support/reservation_worker.php`) with `DatabaseTruncation` and needs the `PROCESS` privilege to read `information_schema.INNODB_TRX`.
- **Cancellation and extension settle money and invoices (D-053, user decision).**
  - *Cancel.* Inside its transaction, `ReservationLifecycleService::cancel(CancellationData)` refunds the whole net collected through the `Reservations\Contracts\CancellationRefunds` port (Cashier) and credits the active invoice through `StayInvoicing` (Billing). The client confirms `refund_fcfa`, which must equal the net collected (409 otherwise). A positive amount requires `refunds.create` (403 otherwise). A cancelled stay exposes `amount_due_fcfa = 0`.
  - *Extend.* Each extension writes an immutable `reservation_extensions` row. If an invoice is active, `StayInvoicing::replaceAfterExtension` credits it and issues a new one in the same transaction. Its lines (initial stay plus each extension, from `ReservationInvoiceData::lines`) sum to the gross. The response carries `meta.replacement_invoice_number`.
  - *Ports.* Reservations never imports Cashier or Billing. A failure in either port rolls the whole operation back.
- **Automatic day quantity (D-055, user decision).** A DAY stay uses the calendar-date difference (20 → 23 = 3), with the existing minimum of one unit for a same-day stay. Creation and quote validate this quantity. DAY extensions add the difference between old and new departure dates, preserving the recorded quantity and price. HALF_DAY remains separate, with the 12-hour rule and explicit supplement validation. Existing stays are not recalculated.
- **Overdue departures and alerts (D-056, user decision).** `Reservation::overdue()` selects IN_PROGRESS stays with `blocked_until <= now()`. `overlapping()` is shared by availability, planning and booking conflicts: an overdue occupied room remains blocked, including future periods, until checkout or an explicit extension. Checkout locks the room before the reservation. `/api/v1/alerts` and `/api/v1/alerts/summary` require `reservations.view`. The menu, topbar bell and overdue-stay banner refresh every 30 seconds while visible; checkout/extensions invalidate `['departure-alerts']`, occupancy, planning and free-room queries. Alerts are computed, never stored, and do not change amounts or send mail automatically.
- **Staff e-mails and mail delivery (D-054, user decision).**
  - *Events.* `Identity\Events\UserLoggedIn` (login alert) and `UserInvited` (welcome, or invitation link) feed the queued `Identity\Listeners\SendStaffEmails`, which sends `StaffMail` (markdown `mail.staff`).
  - *Mail view data.* Pass view data explicitly through `Content::with`, with private constructor properties. Exposing them as public properties made the mail render exhaust memory.
  - *Invitation.* A user created without a password gets an invitation from the `invitations` password broker (72 h, single use). The link points to the public page `/mot-de-passe`, which calls `POST /api/v1/auth/password`.
  - *Reserved domains.* `App\Shared\Mail\Recipients::deliverable()` skips reserved TLDs (`.local`, `.test`…) for customers and staff.
  - *Settings.* `Settings\Application\MailCheck` provides `GET /settings/mail` (no secrets) and `POST /settings/mail/test` (sent synchronously, failures explained in French). The same check runs from `php artisan jb:mail-test`.
  - *Credentials.* SMTP credentials live only in `backend/.env`.
- **Corrections and deletions (D-058, user decision).**
  - *Cashier.* A cashier may cancel only her own payment from the same day (Bangui). `CashierService::cancel` enforces this; the route accepts `payments.cancel|payments.record`.
  - *Modification.* `ReservationModificationService` handles preview and modify for room, dates and billing unit, before the stay and without extensions. It reuses the quoter (excluding the reservation itself), locks the room, and never lets the net drop below the collected amount. An invoiced stay can only be modified by an admin, through `StayInvoicing::replaceAfterChange`.
  - *Deletion.* Deleting needs `records.delete` (`PermissionName::adminOnly()`, never grantable to another role). The flow runs through `App\Shared\Support\RecordDeletion`: an audit snapshot is written first, then the row is deleted, and an FK violation becomes a 409 `record_in_use`.
  - *Usage checks.* Usage is checked through ports implemented by Reservations: `Customers\Contracts\CustomerUsage`, `RoomCatalog\Contracts\RoomUsage`, and `CancellationRefunds::hasPayments` / `StayInvoicing::hasDocuments`.
  - *Never deleted.* Payments, refunds and invoices are never deleted.
  - *Frontend.* The shared `DeleteDialog` (`shared/ui`) asks for a reason and an explicit confirmation; `api.delete` accepts a body.
- **Access pages and public verification (D-059).**
  - *Layout.* Login, forgot password and set password share `features/auth/AuthLayout`: a centered card with no image and a plain background, which the `login-design` E2E checks.
  - *Forgot password.* `POST /auth/forgot-password` checks the account first (user decision): 404, 403 or 422.
  - *Reset links.* They use the `users` broker (60 min) and `motif=oubli`. Invitations use the `invitations` broker on the separate `invitation_tokens` table.
  - *Verification page.* `billing/verification.blade.php` is self-contained (no external assets) and must keep the texts asserted by `InvoiceVerificationTest`.
- **Error pages and settings (D-060).**
  - *Server pages.* `resources/views/errors/` holds self-contained Blade views (`layout`, 403, 404, 419, 429, 500, 503, plus generic `4xx`/`5xx` that show the received code). They are for web links opened outside the SPA (QR codes, e-mails): no link to the staff app, "Réessayer" only on transient errors. `/api/*` keeps the JSON contract. `ErrorPagesTest` checks them with `app.debug=false`.
  - *App pages.* Use `shared/ui/ErrorState` (code, tone `warn|ko|info`, icon, title, message, hint, actions) for 404 (`NotFoundPage`), router failures (`RouteErrorPage`), `RequirePermission` denials and `NoAccessPage`.
  - *Settings.* `SettingsPage` groups rules by key prefix (`GROUPS`: discounts, payments, reservations, billing, then "Autres règles"). Add a prefix there when a new settings family appears in `SettingsSeeder`.
- **Settings.** Read admin-tunable rules through `App\Shared\Settings\SettingsRepository` (scoped per request); the keys and defaults are in `SettingsSeeder`.
- **Cashier (phase 5A).** `CashierService` handles record, cancel and refund. Each operation first locks the reservation through `Reservations\Contracts\ReservationLedger::lockForPayment()`, then checks the balance (`AccountSummary`: due − (valid payments − refunds); a cancelled reservation owes 0). Receipt numbers come from `App\Shared\Numbering\DocumentNumberer::next('REC')`, which must be called inside the transaction; reuse it with `'FAC'` for invoices. Payments are never deleted, only `CANCELLED`, and refunds are separate rows.
- **Cash journal and lists (phase 6B, D-041).** `Cashier\Application\Queries\CashJournal` builds the journal (`GET /cash-journal`) and the receipts list (`GET /payments`); `context()` resolves reservation, customer and room through `ReservationLedger::findMany`, `CustomerDirectory::findMany` and `RoomDirectory::all()` (one query per module, never one per row). `Billing\Application\Queries\InvoiceList` reads customer and room from the frozen snapshot. `Reporting\Application\Queries\ReceivablesQuery` feeds both `GET /receivables` and the dashboard total, so they always agree. Collected = valid payments by `received_at`, refunded = refunds by `processed_at`; cancelled payments are listed but never counted.
- **Billing (phases 5B and 5C).**
  - *Issuing.* `InvoiceService::issue()` builds a frozen `snapshot_json` (`InvoiceSnapshotBuilder`), using `ReservationLedger::invoiceData()`, `CustomerDirectory`, `RoomDirectory` and `Cashier\Contracts\PaymentHistory`. The `Invoice` model throws on any update except ISSUED→CREDITED, and on delete. Corrections go through `credit()`, which creates a CREDIT_NOTE.
  - *PDF.* `resources/views/billing/invoice.blade.php` (dompdf, font subsetting on) is rendered from the snapshot only.
  - *Public verification.* `InvoiceVerification` holds the per-invoice random `verification_code` (hidden, never audited), the public URL built from `jbhotel.verification_base_url`, the QR PNG (chillerlan/php-qrcode v6) and the minimal `publicView()`. Public routes: web `verification/factures/{uuid}?code=` and API `public/invoices/{uuid}/verification`; both are unauthenticated, throttled at 30/min and return the same 404 for unknown/invalid.
- **Notifications (phase 5D).**
  - *Flow.* Domain events (`ShouldDispatchAfterCommit`) → `Notifications\Listeners\NotifyCustomer` (`ShouldQueue`, listed in `NotifyCustomer::EVENTS`) → `StayMessageFactory`, which builds French content from public contracts only → `CustomerNotifier`, which sends `StayMail` (markdown `mail.stay`) only if `CustomerSnapshot::canBeEmailed()`, and audits `notification.sent` without the address.
  - *New operations.* When you add a stay operation, emit an event after commit and add it to `NotifyCustomer::EVENTS` and to the factory.
  - *Unsubscribe.* The signed route is `public.customers.unsubscribe`.
  - *Tests.* Use `Mail::fake()`; `phpunit.xml` runs the queue in sync mode. In local dev the queue driver is `database`: run `php artisan queue:work`.
- **Shell pitfalls on this machine (Windows, Git Bash).** Non-ASCII text passed to `curl -d` is not sent as UTF-8; use `é` escapes or a PHP script. Never pipe into `python -`. For multi-line edits containing quotes, write a PHP script in the scratchpad instead of using `php -r`.
- **Tests.** Use `RefreshDatabase` and `$this->seed(RolesAndPermissionsSeeder::class)`, then `User::factory()->admin()` or `->cashier()` (the password is `UserFactory::PASSWORD`). A login test must send the `Origin: http://localhost:5173` and `Referer` headers so Sanctum opens a session. Call `$this->app['auth']->forgetGuards()` between requests when you check a logout. Tests skip CSRF, so verify the real flow with curl against `php artisan serve`.

### Frontend: features kept isolated

The frontend is split into `src/app/` (router, shell, providers, guards), `src/shared/` (ui, api, utils) and `src/features/{auth,catalog,customers,reservations,cashier,invoices,dashboard,system}` (later: rates, reports, admin). A feature keeps its files flat (`api.ts`, `*Page.tsx`, dialogs, `validation.ts`) until it needs subfolders. A feature never imports another feature's internals; it exposes a small public API through its `index.ts`, like `features/system/index.ts`. Libraries in place: React 19, React Router 8 (imported from `react-router`), TanStack Query 5 and Vitest with Testing Library (React Hook Form and Zod 4 are installed but not used yet).

Code that already exists:
- **API client.** Call the API only through `shared/api/client.ts` (`api.get/post/patch/put/delete`). It sends cookies, adds `X-XSRF-TOKEN` and always throws an `ApiError` (`shared/api/errors.ts`) with a French title and message. 5xx bodies are never shown, and a network failure maps to the required « Connexion impossible… » message.
- **Global error modal.** `app/queryClient.ts` routes every query and mutation error to the modal (`shared/ui/ErrorModalProvider`, `ErrorDialog`). Opt out with `meta: { silentError: true }` only when the screen shows the error itself. Components can also call `useErrorModal().showError(e)`.
- **Formatting.** Format money with `formatFcfa`, which throws on non-integers on purpose, and dates with `formatDate`/`formatDateTime` (`shared/utils/format.ts`).
- **Theme.** `src/index.css` holds the prototype design (D-040): tokens on `:root`, then classes such as `.layout`, `.sidebar`, `.page-heading`, `.panel`, `.metric`, `.badge--green|blue|amber|red|neutral`, `.filterbar`, `.fields`/`.full`, `.toolbar`, `.pairs`, `.planning`, `.modal`. Reuse them instead of inline styles. The accent `#10B981` is too low-contrast for text on a light background.
- **Shell and routing.** `app/routes.tsx` wraps business pages in `RequireAuth` → `AppShell` and each page in `RequirePermission`. `app/navigation.ts` lists the sidebar items with their permission (`upcoming: true` for screens not built yet, served by `UpcomingPage`); `landingPath()` picks the first allowed page. `app/AppProviders.tsx` also clears the session on any 401 so the guard sends the user back to `/connexion`, then to the page they asked for.
- **Current user.** `useCurrentUser()` from `features/auth` returns `{ user, isPending, can }`; `can()` reads the permissions sent by `/auth/me`. Hide actions the user cannot do, but the server stays the authority.
- **UI building blocks** (`shared/ui`): `PageHeading`, `Panel`, `Metric`, `EmptyState`, `LoadingBlock`, `Pair` (`layout.tsx`); `TextField`, `SelectField`, `TextAreaField` (`fields.tsx`, hint and error outside the label, linked with `aria-describedby`); `Modal` (focus trap, Escape, form submit); `Badge`, `ReservationStatusBadge`, `RoomStateBadge` with labels in `statusLabels.ts`; `useToast().notify()` for short confirmations. API types live in `shared/api/types.ts`; check them against real responses when an endpoint changes.
- **Cash actions.** `PaymentActions` (features/cashier) renders the receipt link plus refund and cancel dialogs gated by `refunds.create` and `payments.cancel`; reuse it wherever a payment row appears. After any cash operation invalidate `CASH_KEYS` (payments, cash-journal, receivables, dashboard) and the reservation. Printable pages wrap their `.paper` in `.print-only-paper`; `@media print` hides the shell, buttons and `.no-print`. `shared/ui/Pagination` paginates every list; use `formatSignedFcfa` for refunds and credit notes.
- **Forms.** Forms use controlled state plus a small validation helper (see `features/customers/validation.ts`) for comfort; on a 422, copy `toUserError(e).fieldErrors` onto the fields while the global modal explains the error. Keep what the user typed.
- **Screen tests.** `src/test/renderApp.tsx` renders the real routes in a memory router with `mockApi({ 'GET /api/v1/...': reply })`, which records every call; `cashier()` builds a user with the cashier's permissions. Assert on roles and labels, and on the order and bodies of the recorded calls.

## Business rules that must always hold

- **Money is stored as integer FCFA** everywhere, with explicit rounding for percentage discounts. Display amounts with spaces between thousands.
- **Rates are versioned** in `room_rates` through `effective_from`/`effective_to`. A rate change adds a new version and never edits existing rows. At confirmation, a reservation stores `rate_id`, `billing_unit`, `quantity`, `applied_unit_price_fcfa`, `gross_fcfa`, the discount fields and `net_fcfa`. Existing reservations and issued invoices are **never recalculated**.
- Price is per room, whatever the number of occupants, as long as room capacity is respected.
- **Room states are computed for a given period** from active reservations and maintenance. The states are libre (free), réservé (booked), occupé (occupied) and maintenance. Never store an `is_occupied` flag. Reservation statuses are: en attente (pending), confirmée (confirmed), en cours (in progress), terminée (completed), annulée (cancelled).
- There are no fixed check-in or check-out times. Times are optional, but the period must be defined well enough to block availability.
- **No double booking.** Confirm inside a transaction with locking, and recheck availability before commit. This must hold when two cashiers confirm at the same moment, so write concurrency tests. Rooms under maintenance cannot be booked.
- **Payments** can be full, partial or deferred, with several payments per reservation and a receipt for each one. Net collected (validated payments minus refunds) must not exceed the amount due. Refunds are separate rows. Never delete a payment or an issued invoice. An issued invoice, with its unique number and `snapshot_json`, cannot be changed; a correction goes through a corrective document.
- **Discounts** are a percentage or a fixed amount. Each one records a reason, an author and a configurable cashier cap, and the server validates it.
- Write an audit log for rate changes, extensions, cancellations, discounts, refunds and permission-sensitive actions.
- Reporting must keep three amounts apart: invoiced amount, accounting revenue and cash collected. Each indicator needs a definition and must reconcile with the recorded transactions.
- Only the server decides authorization and availability. The UI never decides them alone.

## Validation and error handling (every operation)

- Validate in React for comfort and in Laravel as the authority. Any error blocks the operation.
- **All user-facing error messages are in French** and appear in an accessible modal. The modal has a title, a clear explanation, a close action and, where possible, a hint on how to fix it. Never show stack traces or sensitive details. Keep what the user typed, and optionally highlight the faulty fields too.
- Handle each of these explicitly: 422, 401, 403, 404, 409 (room unavailable or conflict), 429 and 500/503. For network errors, show exactly: « Connexion impossible. Vérifiez votre connexion et réessayez. »
- Modals work with the keyboard. Keep focus inside the modal while it is open and return it on close. Use `role=alertdialog` when appropriate, and include an explicit close button.

## UI

- Colors (a proposal from 05, still to be validated by the hotel): primary `#047857`, accent `#10B981`, background `#F8FAFC`, text `#0F172A`, error `#B91C1C`, warning `#B45309`. Never use color alone to show a status.
- Typography and layout: Inter or the system font, 16px base size, 8px grid.
- Targets: WCAG 2.2 AA; cash-desk desktop first, with tablet support.
- Formats: print CSS for A4 invoices and receipts, FCFA amounts, local date formats and a configurable time zone.

## Working rules from the brief (06)

- Work through phases 0 to 8 in order. Before each phase, list the files you will create or change and the decisions you need. After each phase, report the commands you ran, the tests that passed and failed, and the known limitations.
- Write real, runnable code, with no pseudo-implementations or hidden TODOs. Never claim a feature works without a test that proves it.
- Never hard-code real admin credentials or secrets.
- When a business rule is missing, say so and propose options with their consequences. Do not guess.
- The acceptance criteria in 06 and the test scenarios in 07 are the reference test cases. For example:
  - changing a rate from 50 000 to 60 000 FCFA leaves an earlier invoice at 50 000;
  - a 20 000 advance on 50 000 leaves a balance of 30 000;
  - a 10 % discount on 50 000 gives 45 000.


### Content design (user request, 19 November 2026)
- The user supplied a financial dashboard reference image and required the aside design to be preserved. **Latest explicit request (20 November 2026, D-057):** add desktop collapse/expand with an 80 px icon rail and responsive content. This targeted change is authorized; preserve the expanded design and the full mobile drawer. `app/sidebar.css` scopes compact rules above 680 px. The preference lives in browser localStorage (`jb-hotel.sidebar-collapsed`), with a fallback when storage is denied.
- `frontend/src/content-theme.css` scopes the reference design to `.workspace`, dialogs and the login panel. Shared headings, metrics, filters, tables, buttons and icons carry it across the app; print rules keep documents readable.
- Buttons use decorative icons alongside accessible labels; keep permission checks, keyboard focus, confirmations and disabled/loading states. Do not add invented comparison percentages or notification counts from the reference.
- Local checks: 79 frontend tests, 4 browser tests; the visual test covers 17 screens/details plus a dialog and responsive layouts. See CHECK_LEVEL.md and docs/RECETTE.md.

- List filters apply automatically through `shared/ui/useAutoFilters`: text search waits 300 ms, valid choices/dates apply immediately, filter changes reset the page. Keep invalid periods as drafts and retain the last valid results; no submit button is needed.
- The invoice/credit-note PDF follows the green/gold reference in `billing/invoice.blade.php`; all business content still comes from the immutable snapshot. Never copy fictitious taxes, services, due dates, signatures or stamps from the reference image.

- After bulk frontend edits, verify the actual running development server with `npm run check:dev` (anonymous browser, no database reset). A green build or E2E on a fresh server does not prove the long-running Vite process has valid module transforms. If a present export is missing from the served module, inspect the response and restart only Vite with `--force` when its in-memory transform is stale.

- User design requirements (19 November 2026): overviews on business pages; green/blue actions alternating between adjacent buttons; larger spacing and decorative icons inside all text/select/textarea fields. Preserve the aside.
- Each table needs filters and pagination. Use `LocalTable` for fully loaded secondary datasets; keep server pagination for remote lists. Printed local tables include all received rows and restore their screen state afterward.
- Occupied rooms must be red everywhere; reserved blue, free green, maintenance amber. The Rooms admin screen reads the existing occupancy API only when the user can `reservations.view`.
