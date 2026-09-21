# AGENT.md — [PROJECT_NAME] Backend

> Read this file fully before planning or implementing anything in this repository.
> It is the source of truth for what we are building, which tools we use, and how backend code must be written.
> If a request conflicts with this file, say so and ask before proceeding.

**Scope:** this repository is the **backend API only**. Do not create frontend or mobile code here. A separate Expo client will consume this API later, so the API contract must be clean, stable and well documented.

---

## 1. Project Overview

**[PROJECT_NAME]** is a subscription tracking platform. Users record every recurring subscription they pay for (streaming, SaaS, utilities, memberships, etc.), see what they spend per month and per year, and get reminded before a renewal or free trial ends so they never get charged by surprise.

**Core value:** clarity over recurring spend, and timely reminders.

**Primary users:** individuals managing personal subscriptions. Assume many users are in Nigeria, so multi-currency support (NGN and USD at minimum) matters, and responses should stay lean for low-bandwidth mobile clients.

---

## 2. Locked Tech Stack

These tools are decided. Do not replace them or add alternatives.

| Layer | Tool |
|---|---|
| Runtime | **Node.js** |
| Framework | **Express.js** |
| Database | **MongoDB** (via Mongoose) |
| Authentication | **Sign up / Sign in with Google** and **Sign in with Apple** (the Expo client obtains the ID token, this API verifies it) |

**Default choices** (use these unless I say otherwise, and tell me if you think one is wrong):
- **Language:** TypeScript.
- **Validation:** Zod for request bodies, query params and environment variables.
- **Package manager:** npm.
- **Testing:** Vitest or Jest with Supertest, plus `mongodb-memory-server` for integration tests.

**Dependency rule:** Never add a new library without telling me what it is, why it is needed, and what the built-in or existing alternative was. Prefer fewer dependencies. Check that a package is actively maintained before proposing it.

**Security-first dependency rule:** Do not install, update, or remove an npm package silently. Before any package change, review its maintenance status, known vulnerabilities, license, transitive dependency impact, and required permissions or runtime behavior. State the security trade-offs and get approval before installing it. Afterward, run the repository's audit and test checks, keep the lockfile in sync, and remove unused packages and imports. Never use install scripts or packages from untrusted sources without explicit approval.

> More tools will be added to this section as the project grows. Keep this table current.

---

## 3. How the Agent Must Work

1. **Read before writing.** Look at the existing code, folder structure and patterns before creating anything. Match what already exists.
2. **Plan first for anything non-trivial.** For any task touching more than 2–3 files, or any schema, auth or API contract change, give a short plan (files to change, approach, risks) and wait for my approval.
3. **Small, focused changes.** One feature or fix per change. No drive-by refactors, no unrelated formatting changes.
4. **Do not invent.** If something is unclear (requirements, an API contract, a business rule), ask. Never guess at auth logic, money handling or data deletion.
5. **Security review first.** For every addition, modification, or removal, identify affected assets, trust boundaries, abuse cases, authentication and authorization requirements, input and output risks, logging exposure, and failure behavior before editing. Reject insecure shortcuts and ask before weakening a security control.
6. **Verify against current docs.** Google and Apple token verification details, npm packages, and library APIs change. Check current official documentation, installed package versions, and security advisories before implementing auth or changing security-sensitive dependencies.
7. **Run it.** After changes, run the type-check, linter, relevant tests, and dependency audit. Report the results honestly. If you could not run something, say so.
8. **Be honest about uncertainty.** Say "I'm not sure" rather than presenting a guess as fact. Point out bugs, risks or bad ideas you notice, including in my requests.
9. **Never commit secrets.** No keys, tokens, client secrets or `.env` files in git. Update `.env.example` whenever you add a variable.

---

## 4. Project Structure

```
/
├── AGENT.md
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── config/           # env parsing (Zod), db connection, constants
│   ├── models/           # Mongoose schemas
│   ├── routes/           # route definitions only
│   ├── controllers/      # parse request → call service → shape response
│   ├── services/         # business logic (no req/res objects here)
│   ├── middleware/       # auth, validate, error handler, rate limit
│   ├── validators/       # Zod schemas
│   ├── jobs/             # scheduled work (renewal reminders)
│   ├── utils/
│   ├── app.ts            # Express app setup (no listen call)
│   └── server.ts         # starts the server and connects the database
└── tests/
    ├── unit/
    └── integration/
```

**Layering rule:** `route → validator → controller → service → model`.
- Controllers never touch the database directly.
- Services never see `req` or `res`.
- `app.ts` is separate from `server.ts` so the app can be imported in tests without opening a port.

---

## 5. API Rules (Express)

- **Style:** REST, JSON, versioned under `/api/v1`.
- **Response envelope:**
  - Success: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code": "STRING_CODE", "message": "Human readable", "details": ... } }`
- **Status codes:** use them correctly (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`).
- **Validation:** every route validates `body`, `params` and `query` with Zod before the controller runs. Reject unknown fields.
- **Errors:** use one centralized error-handling middleware and a custom `AppError` class. Wrap async handlers so rejected promises reach it. Never leak stack traces or internal messages in production.
- **Pagination:** every list endpoint is paginated (cursor or `page`/`limit`) with a sensible maximum.
- **Health check:** `GET /health` returns service and database status without exposing internals.
- **Documentation:** keep an up-to-date API reference (OpenAPI/Swagger or a markdown file) so the Expo client can be built against a clear contract. Propose the format before creating it.

### Security baseline
- `helmet`, strict `cors` (allowlist from env), request body size limit.
- Rate limiting on all routes, stricter on `/auth/*`.
- Input sanitization against NoSQL operator injection (e.g. keys starting with `$` or containing `.`).
- Never log tokens, ID tokens, secrets or personal data. Use structured logs with a request ID.
- Apply least privilege to database users, service credentials, tokens, npm scripts, and runtime permissions.
- Use secure defaults for cookies, headers, timeouts, redirects, error responses, and serialization. Fail closed when security checks or configuration are missing.
- Treat dependency advisories, secret scans, static analysis findings, and authorization failures as release-blocking until reviewed and resolved or explicitly accepted.

### Config
- All environment variables are parsed and validated once at startup in `config/`. The app must fail fast if a required variable is missing.
- Never read `process.env` anywhere else.

---

## 6. Database Rules (MongoDB / Mongoose)

- **Every user-owned document has a `userId`, and every query for user data must be scoped by the authenticated `userId`.** Never fetch by `_id` alone for user-owned data. This prevents one user from reading another user's subscriptions.
- **Money:** store amounts as **integers in the smallest currency unit** (kobo, cents) plus an ISO 4217 `currency` code. Never store money as floating point.
- **Dates:** store everything in **UTC**. Store the user's IANA timezone on the user document and use it only for deciding reminder times and display logic.
- **Indexes:** define indexes in the schema for every field used to filter or sort (e.g. `{ userId: 1, nextBillingDate: 1 }`). Unique indexes for identity fields.
- **Timestamps:** `timestamps: true` on every schema.
- **Deletion:** subscriptions are archived through `status`, not hard-deleted, so history and insights stay accurate. Account deletion is a full removal path (see Auth).
- **Schema changes:** propose a migration plan for any change to an existing collection. Do not silently change field meanings.
- **Sensitive data:** never store card numbers, CVVs or bank credentials. A payment method is a free-text label only (e.g. "GTBank card ending 4421").

### Core domain model (starting point, confirm before changing)

**User**
- `email`, `emailVerified`, `name`, `avatarUrl`
- `authProviders: [{ provider: 'google' | 'apple', providerUserId, email }]`
- `defaultCurrency`, `timezone`, `pushTokens[]`, `notificationPreferences`
- `refreshTokens` (hashed, rotating), `createdAt`, `updatedAt`

**Subscription**
- `userId`, `name`, `description`, `category`
- `amount` (integer, minor units), `currency`
- `billingCycle` (`weekly | monthly | quarterly | yearly | custom`), `customIntervalDays`
- `startDate`, `nextBillingDate`, `trialEndsAt`
- `status` (`active | trial | paused | cancelled`)
- `paymentMethodLabel`, `notes`, `websiteUrl`
- `reminderDaysBefore` (array of numbers)

**Business rules that must be implemented carefully**
- `nextBillingDate` calculation must handle month-end edge cases (a subscription billed on the 31st renews on the last day of shorter months).
- Normalize costs to monthly and yearly equivalents for insights, in the subscription's own currency. Do not add amounts across currencies without an explicit, stored conversion rate.
- Paused and cancelled subscriptions are excluded from upcoming-spend totals.
- Free trials with `trialEndsAt` trigger reminders before the first charge.

---

## 7. Authentication Rules (Google + Apple)

Authentication is the most security-sensitive part of the API. Follow this design and ask before deviating.

### Flow
1. The Expo client performs the native sign-in with Google or Apple and obtains an **ID token** (and a nonce where applicable).
2. The client sends the ID token to `POST /api/v1/auth/google` or `POST /api/v1/auth/apple`.
3. **This API verifies the token itself.** Never trust an email, name or user ID sent by the client.
   - **Google:** verify the ID token signature, expiry, issuer, and that the audience matches our configured client IDs (use Google's official verification library).
   - **Apple:** verify the JWT against Apple's public keys (JWKS), check issuer (`https://appleid.apple.com`), audience (our bundle ID / service ID), expiry and nonce.
4. Find or create the user, then issue **our own** session: a short-lived access token and a longer-lived **rotating refresh token**. Store only a **hash** of refresh tokens in the database.
5. Return tokens in the JSON response for the mobile client to keep in secure storage. Never set them anywhere that makes them easy to leak.

### Account rules
- Link accounts by the provider's stable user ID first, then by **verified** email. Never link on an unverified email.
- **Apple quirks:** the user's name and email are only returned on the **first** sign-in, so persist them immediately. Users may hide their email behind Apple's private relay address; treat it as a valid email and never assume it matches their Google email.
- **Account deletion:** provide `DELETE /api/v1/users/me`. It must delete the user's data, revoke our tokens, and revoke the Apple token where applicable (an App Store requirement for apps with account creation).
- Provide `POST /auth/refresh` and `POST /auth/logout` (revokes the refresh token).
- Detect refresh token reuse and revoke the whole token family if it happens.
- Auth middleware verifies the access token on every protected route and attaches the user to the request.

### Secrets and config
- Google client IDs (iOS, Android, web) and Apple credentials (team ID, key ID, private key, bundle ID) and JWT secrets live in environment variables only and are documented in `.env.example`.

---

## 8. Reminders and Background Jobs

- A scheduled job finds subscriptions with an upcoming `nextBillingDate` or `trialEndsAt` based on each user's `reminderDaysBefore` and timezone, then triggers notifications (push tokens are stored on the user; delivery details will be decided when the client is built).
- Jobs must be **idempotent**: running twice must never send the same reminder twice. Track sent reminders.
- Before choosing a scheduler or queue (node-cron, Agenda, BullMQ, etc.), propose the options with trade-offs and wait for my decision.

---

## 9. Testing and Quality

- Unit-test services, especially `nextBillingDate` calculation, cost normalization, and token verification logic.
- Integration-test key endpoints (auth, subscription CRUD, ownership checks) against an in-memory or test database.
- Every endpoint that returns user data needs a test proving another user cannot access it.
- Lint and type-check must pass with zero errors before a task is considered done.
- No `any` in TypeScript without a comment explaining why.
- Prefer clear names and small functions over clever code. Comments explain *why*, not *what*.

---

## 10. Git Workflow

- Branch strategy: **`main` → `dev` → `feature/*`**. Never commit directly to `main` or `dev`. Create feature branches from `dev`.
- Use **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, with an optional scope, e.g. `feat(auth): verify Apple ID token`.
- Keep commits small and atomic.
- Development happens on **Windows with Git Bash**. Scripts and commands must be cross-platform. Do not rely on Linux-only commands or PowerShell-only syntax, and use `cross-env` or Node scripts where environment variables are needed.

---

## 11. Build Order (suggested)

Propose changes to this order if you see a better one.

1. Project setup: TypeScript, Express app, config validation, MongoDB connection, error handling, health check
2. User model and Google + Apple auth, refresh/logout, protected route middleware
3. Subscription model and CRUD with ownership scoping and pagination
4. Billing date logic and cost insights (monthly/yearly totals, upcoming renewals)
5. Reminder job
6. Account deletion, hardening, API documentation

---

## 12. Definition of Done

A task is done only when:
- [ ] It matches this file's rules and existing code patterns
- [ ] Inputs are validated and errors are handled
- [ ] User data queries are scoped by `userId`
- [ ] Types, lint and relevant tests pass
- [ ] `.env.example` and API docs are updated if config or the contract changed
- [ ] No secrets, debug logs or dead code are left behind
- [ ] The summary tells me what changed, what was tested, and any open risks or follow-ups

---

## 13. Never Do This

- Never trust identity data from the client without server-side token verification.
- Never store money as floats or mix currencies in totals without a stored rate.
- Never store raw refresh tokens, passwords, card numbers or bank details.
- Never query user-owned data without scoping by the authenticated user.
- Never expose stack traces or internal errors to API consumers.
- Never add dependencies, change the locked stack, or restructure folders without approval.
- Never write frontend or mobile code in this repository.
- Never mark work as tested or working if it was not actually run.

---

## 14. Open Decisions (update as we decide)

- Project name: **[PROJECT_NAME]** (replace throughout)
- Reminder scheduler choice
- API documentation format (OpenAPI/Swagger vs markdown)
- Currency conversion source (if cross-currency totals are wanted)
- Deployment target and hosting
- Monetization / premium features (none decided yet)
