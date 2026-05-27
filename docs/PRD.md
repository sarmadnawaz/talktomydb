# TalkToMyDB — Product Requirements Document

**Status:** Draft v1
**Owner:** Sarmad
**Target launch:** Day 6 of the build sprint
**Companion docs:** `demo-1-scope.md` (high-level), `freelance-roadmap.md` (strategic context)

---

## 1. Executive summary

TalkToMyDB is a web app that lets users connect a Postgres database, ask questions in natural language, and receive validated SQL, results, and auto-rendered charts. It is built to look and feel like a production-grade tool rather than a hackathon demo — meaning real safety guardrails, schema intelligence, and honest failure handling.

The product exists primarily as a portfolio asset: a credibility-establishing artifact that founders viewing a cold email will associate with "this person ships real AI features safely." Its commercial success is measured in **inbound contract leads** generated, not stars, users, or revenue from the product itself.

---

## 2. Goals & non-goals

### Goals
- G1. Demonstrate senior-engineer-level production thinking in an AI/LLM context — visible through architecture, safety, and code quality
- G2. Generate qualified inbound interest from SaaS founders evaluating Sarmad for contract work
- G3. Ship in 6 focused days with no scope creep
- G4. Be deployable by a third party in under 10 minutes via `docker compose up`
- G5. Pass a "would I trust this with a real production read-replica connection string?" sniff test from a skeptical engineer

### Non-goals (explicitly out of scope for v1)
- N1. Multi-tenant SaaS — no user accounts, no team workspaces
- N2. Multi-database support — Postgres only (MySQL, Snowflake, BigQuery future)
- N3. Write operations — read-only enforced at every layer
- N4. Fine-tuning, embeddings, or custom model training — vanilla Claude with strong prompting
- N5. Persistent user data beyond session — no saved queries server-side, no history sync
- N6. Authentication beyond a single shared password — proper SSO is post-v1
- N7. Mobile-first UI — desktop primary, mobile is "doesn't break" not "delightful"
- N8. Real-time streaming results — request/response is fine for v1

---

## 3. Target users (for the product UX)

### Primary: "Curious Engineer Evaluator"
- Senior or staff engineer at a SaaS company who lands on the GitHub repo or live demo from cold outreach, HN, or a referral
- Will spend 60–120 seconds deciding if this is "another text-to-SQL toy" or "actually well-engineered"
- Trying to answer: "Could this person build a similar feature in our product?"
- **Their judgment is the only judgment the product needs to optimize for.**

### Secondary: "Data-Curious Founder"
- Non-technical founder who wants to query their app DB without learning SQL
- Will try the live demo with the pre-seeded sample DB
- Trying to answer: "Could I use something like this internally?"

### Anti-persona (do NOT optimize for)
- Production data analysts (they already have BI tools)
- Enterprise buyers (this is not a SaaS, do not add SOC2/SSO copy)
- Teaching/educational users

---

## 4. User journeys

### J1: Engineer evaluator (GitHub-first path)
1. Lands on `github.com/sarmad/talktomydb` from HN/cold email/LinkedIn
2. Reads README hero + "what's different" section (target: 30 seconds)
3. Scans architecture diagram + threat model table
4. Clicks "live demo" link
5. Sees pre-seeded DB landing page with 10 example questions
6. Clicks one example, sees the full flow (SQL + reasoning + result + chart)
7. Tries a question that breaks it, watches it fail gracefully
8. Clicks "Built by Sarmad" → portfolio site → Calendly OR sends DM
9. **Conversion event:** books a call or sends a "hey, are you available for contract work?" message

### J2: Founder evaluator (live demo-first path)
1. Lands on `talktomydb.dev` from a tweet or LinkedIn post
2. Sees hero + "try it" CTA with pre-baked examples
3. Clicks 2–3 examples, gets a feel for capabilities
4. Tries their own question on the sample DB
5. Optionally clicks "deploy your own" → reads quickstart
6. Optionally clicks "Built by Sarmad" → portfolio

### J3: Self-hoster (post-launch tail)
1. Clones repo, runs `docker compose up`
2. Sets `DATABASE_URL` and `ANTHROPIC_API_KEY` and `APP_PASSWORD`
3. Visits localhost:3000, enters password
4. Connects their actual DB, queries it
5. **Conversion event:** stars the repo, follows on Twitter

---

## 5. Functional requirements

### 5.1 Connection management

**FR-1.1** User can enter a Postgres connection string via a form on first visit
**FR-1.2** Connection string is validated (parseable URI, reachable host, accepts connection)
**FR-1.3** Connection string is stored ONLY in an encrypted, httpOnly, sameSite=strict session cookie — never logged, never persisted server-side
**FR-1.4** A "test connection" button reports success/failure with actionable error messages (auth failed, host unreachable, DB doesn't exist, SSL required)
**FR-1.5** A "disconnect" button clears the cookie and returns to the connection form
**FR-1.6** On the live demo, the connection step is bypassed — pre-configured sample DB is auto-connected
**FR-1.7** Server-side, the app spawns a fresh `pg.Client` per request using these enforced settings:
  - `default_transaction_read_only = on`
  - `statement_timeout = '10s'`
  - `lock_timeout = '2s'`
  - `idle_in_transaction_session_timeout = '5s'`
**FR-1.8** Connection pool is bounded (max 5 concurrent connections per app instance)

### 5.2 Schema introspection

**FR-2.1** On connection success, introspect the public schema via `information_schema` and `pg_catalog`
**FR-2.2** Capture per table: name, column list (name, type, nullable, default), primary key, foreign keys (to_table, to_column), indexes, row count estimate (from `pg_class.reltuples`), table comment
**FR-2.3** Capture per column: name, type, nullable, default, comment, is_pii_candidate (boolean, derived from name heuristics)
**FR-2.4** Cap schema scan to 500 tables. If exceeded, allow user to filter by schema name or table name pattern.
**FR-2.5** Cache the introspected schema in the session for the lifetime of the connection
**FR-2.6** Sidebar UI renders the schema as a collapsible tree: schema → table → columns (with type + FK indicator + PII indicator)
**FR-2.7** Clicking a table in the sidebar inserts a hint into the query input ("about the customers table: ...")

### 5.3 Question → SQL generation

**FR-3.1** Query input is a single textarea with placeholder examples
**FR-3.2** On submit, the system calls Claude Sonnet 4.6 with: compact data dictionary (schema), the question, and strict instructions to return structured output
**FR-3.3** Structured output via Claude tool use, fields:
  - `sql` (string, required) — the generated SQL, or empty if unanswerable
  - `explanation` (string, required) — plain-English description of what the SQL does
  - `confidence` (enum: "high" | "medium" | "low", required)
  - `unanswerable_reason` (string, optional) — populated if the schema cannot answer the question
  - `assumptions` (string[], optional) — assumptions made (e.g., "assuming 'last quarter' means previous calendar quarter")
**FR-3.4** Data dictionary sent to Claude is a compact representation, not raw schema. Target ≤ 4000 tokens for schemas up to 100 tables. Format:
  ```
  Table: customers (50000 rows)
    - id (uuid, PK)
    - email (varchar, PII)
    - created_at (timestamptz)
    - org_id (uuid, FK → orgs.id)
  ```
**FR-3.5** If user's question is ambiguous, the model is instructed to make reasonable assumptions and list them in `assumptions` rather than asking clarifying questions
**FR-3.6** If the schema cannot answer the question, the model must populate `unanswerable_reason` and return empty `sql`. No hallucinated tables/columns ever.

### 5.4 SQL validation

**FR-4.1** Before execution, parse generated SQL with `pgsql-parser`
**FR-4.2** Reject if SQL contains any of: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `CALL`, `DO`, `MERGE`
**FR-4.3** Reject if SQL references `pg_catalog.*`, `information_schema.*`, or `pg_*` system tables/views
**FR-4.4** Reject if SQL contains multiple statements (`;` not at the end)
**FR-4.5** Run `EXPLAIN (FORMAT JSON)` on the generated SQL. Reject if:
  - Estimated total cost > 1,000,000
  - Estimated rows returned > 100,000
**FR-4.6** All rejections show the user: the SQL, the reason, and the suggestion (e.g., "add a LIMIT clause", "the model attempted a write — re-phrase your question")

### 5.5 SQL execution

**FR-5.1** Execute validated SQL against the read-only connection
**FR-5.2** Enforce a hard `LIMIT 1000` on the outer query (append if not present, replace if present and larger)
**FR-5.3** Stream results as JSON to the client (no need to load 1000 rows in memory before responding for v1, but be ready)
**FR-5.4** On execution error, show: error message, the SQL, and an "ask Claude to fix this" button (sends the error back to Claude with the original question)
**FR-5.5** Execution timeout at 10s (enforced by `statement_timeout`); UI shows timeout-specific error

### 5.6 PII handling

**FR-6.1** Identify PII columns via heuristics: column name matches regex `(?i)(email|phone|ssn|password|token|api_key|credit_card|address|first_name|last_name|dob|birth_date)`
**FR-6.2** Optional: an LLM-based PII classifier pass on column names + sample values (cached per schema). v1 can ship with heuristics only.
**FR-6.3** Default state: "Redact PII" toggle is ON. Redacted values display as `[redacted email]`, `[redacted phone]`, etc.
**FR-6.4** Toggle is per-session. Toggling does NOT re-run the query; it re-renders the cached results.
**FR-6.5** PII redaction happens server-side before sending results to the client when toggle is ON. When OFF, raw values are sent.

### 5.7 Results display

**FR-7.1** Results render as a paginated table (50 rows/page, max 1000)
**FR-7.2** Columns are sortable client-side
**FR-7.3** PII columns have a small badge indicator
**FR-7.4** "Export CSV" button downloads current result set (respects PII redaction state)
**FR-7.5** A "Why this SQL?" expandable shows the `explanation` and `assumptions` fields

### 5.8 Auto-charting

**FR-8.1** After results render, attempt to auto-detect chart type:
  - 1 timestamp/date column + 1 numeric column → line chart
  - 1 categorical column + 1 numeric column, ≤ 20 rows → bar chart
  - 2 numeric columns → scatter plot
  - Single numeric value (1 row, 1 col) → big-number callout
  - Otherwise → no chart
**FR-8.2** Chart renders in a tab next to the table. Tab is hidden if no chart applicable.
**FR-8.3** User can manually override chart type via dropdown

### 5.9 Query history

**FR-9.1** Maintain in-session query history (last 50 queries) in localStorage
**FR-9.2** Click a history item to re-populate the question + generated SQL
**FR-9.3** "Edit SQL" button lets user modify the SQL directly and re-run (with same validation pipeline)
**FR-9.4** History is cleared on disconnect

### 5.10 Landing & onboarding

**FR-10.1** On the live demo at `talktomydb.dev`, landing page shows:
  - Hero with one-line pitch + animated screenshot/GIF
  - 10 pre-baked example questions as clickable cards
  - "What's different" 4-point bullet list
  - Link to GitHub repo
  - "Built by Sarmad" footer with portfolio link + Calendly CTA
**FR-10.2** Clicking an example question auto-runs it against the pre-seeded DB
**FR-10.3** On self-hosted deploys, landing page is the connection form

---

## 6. Non-functional requirements

### 6.1 Performance
- **NFR-P1** Schema introspection completes in < 3s for 100-table schemas
- **NFR-P2** Question → SQL generation completes in < 5s p50, < 10s p95
- **NFR-P3** End-to-end (question → rendered results) < 15s p95 for queries that execute in < 2s
- **NFR-P4** First Contentful Paint of landing page < 1.5s on 4G

### 6.2 Security (see also: §10 threat model)
- **NFR-S1** All connection strings encrypted at rest (in cookie) using AES-256-GCM with a server-side key
- **NFR-S2** No connection strings or query results in server logs
- **NFR-S3** Generated SQL is never executed without passing the full validation pipeline (FR-4)
- **NFR-S4** Postgres role connection is enforced read-only at the connection level, not just in prompts
- **NFR-S5** Self-hosted version requires `APP_PASSWORD` env var; the app refuses to start without it
- **NFR-S6** `ANTHROPIC_API_KEY` is never sent to the client

### 6.3 Reliability
- **NFR-R1** Anthropic API failures show a clear error + retry button — no infinite spinners
- **NFR-R2** DB connection drops are detected and surfaced; user can re-test connection from the error state
- **NFR-R3** No silent failures — every error path has user-visible feedback

### 6.4 Code quality (visible to evaluators)
- **NFR-Q1** TypeScript strict mode, no `any` in committed code
- **NFR-Q2** ESLint + Prettier configured, CI runs both
- **NFR-Q3** Conventional commits
- **NFR-Q4** README links to a 2-page `ARCHITECTURE.md` for evaluators who go deep
- **NFR-Q5** At least 5 representative tests: SQL validator, PII detector, schema serializer, prompt builder, end-to-end happy path

---

## 7. Technical architecture

### 7.1 Stack
- **Runtime:** Node 20+
- **Framework:** Next.js 15 (App Router)
- **UI:** shadcn/ui, Tailwind CSS, Lucide icons
- **Charts:** Recharts
- **DB driver:** `pg` (node-postgres)
- **SQL parsing:** `pgsql-parser`
- **LLM:** `@anthropic-ai/sdk`, model `claude-sonnet-4-6`
- **Crypto:** Node built-in `crypto` (AES-256-GCM for cookie encryption)
- **Deploy:** Vercel for live demo, Docker for self-host
- **Sample DB host:** Neon free tier, seeded with DVD Rental sample

### 7.2 Component diagram
```
Browser
  │
  │ (1) connect form / question input
  ▼
Next.js App Router (Vercel)
  ├── /api/connect    → validate + encrypt + cookie
  ├── /api/schema     → introspect → cache in session
  ├── /api/query      → 
  │     ├─ Claude (generate SQL)
  │     ├─ SQL validator (parse + EXPLAIN)
  │     ├─ Read-only pg client (execute)
  │     ├─ PII redactor
  │     └─ Return JSON
  └── /api/disconnect → clear cookie
       │
       ▼
   Postgres (user's DB)
       
   Anthropic API ←──── (separate, always server-side)
```

### 7.3 Data flow for a single question
1. Browser POSTs `{ question }` to `/api/query`
2. Server reads encrypted connection string from cookie, gets cached schema
3. Server builds Claude prompt: system prompt + data dictionary + question
4. Server calls Claude with tool use forcing structured output
5. Server validates returned SQL (FR-4)
6. Server executes SQL via read-only connection
7. Server applies PII redaction (if toggled on)
8. Server returns `{ sql, explanation, confidence, assumptions, rows, columns, chartHint, error? }`
9. Client renders table + optional chart

### 7.4 Repo structure
```
talktomydb/
├── app/
│   ├── page.tsx                  # landing / connect form
│   ├── query/page.tsx            # main query UI
│   ├── api/
│   │   ├── connect/route.ts
│   │   ├── schema/route.ts
│   │   ├── query/route.ts
│   │   └── disconnect/route.ts
├── lib/
│   ├── db/
│   │   ├── client.ts             # pg client factory
│   │   ├── introspect.ts         # schema introspection
│   │   └── readonly.ts           # connection-level enforcement
│   ├── llm/
│   │   ├── prompt.ts             # prompt builder
│   │   └── generate.ts           # Anthropic call + tool use
│   ├── sql/
│   │   ├── validate.ts           # parse + reject writes/system tables
│   │   ├── explain.ts            # EXPLAIN + cost gates
│   │   └── enforce-limit.ts
│   ├── pii/
│   │   └── detect.ts             # heuristic PII detection + redaction
│   ├── crypto/
│   │   └── cookie.ts             # AES-256-GCM for connection strings
│   └── auth/
│       └── password.ts           # APP_PASSWORD gate middleware
├── components/                   # shadcn components + custom
├── tests/                        # vitest suite
├── docker-compose.yml
├── Dockerfile
├── README.md
├── ARCHITECTURE.md
├── SECURITY.md                   # threat model + responsible disclosure
└── package.json
```

---

## 8. API contracts

### POST /api/connect
**Request:** `{ connectionString: string }`
**Response 200:** `{ ok: true, tableCount: number, schemaName: string }`
**Response 400:** `{ ok: false, error: string, code: 'INVALID_URI' | 'CONNECTION_REFUSED' | 'AUTH_FAILED' | 'SSL_REQUIRED' | 'DB_NOT_FOUND' }`

### GET /api/schema
**Response 200:** `{ tables: TableMeta[], totalRows: number, schemaHash: string }`
**Response 401:** `{ error: 'not_connected' }`

### POST /api/query
**Request:** `{ question: string, redactPii: boolean, sqlOverride?: string }`
**Response 200:**
```json
{
  "sql": "SELECT ...",
  "explanation": "...",
  "confidence": "high",
  "assumptions": ["..."],
  "rows": [{...}],
  "columns": [{"name": "...", "type": "...", "isPii": false}],
  "rowCount": 42,
  "executionMs": 234,
  "chartHint": "bar" | "line" | "scatter" | "bignum" | null
}
```
**Response 200 (unanswerable):** `{ unanswerable: true, reason: "..." }`
**Response 400 (validation failed):** `{ rejected: true, sql: "...", reason: "...", suggestion: "..." }`
**Response 500 (execution failed):** `{ error: "...", sql: "...", canRetry: true }`

### POST /api/disconnect
**Response 200:** `{ ok: true }`

---

## 9. UI specs (component-level)

### 9.1 Landing page (live demo)
- **Hero:** centered, max-width 720px. H1 = "Talk to your Postgres in English." Subtitle = "Production-grade text-to-SQL with real guardrails, schema intelligence, and honest failure handling." Two buttons: "Try the demo" (scrolls to examples) + "View on GitHub."
- **Animated screenshot:** GIF or short Loom embed under hero
- **Examples grid:** 2-column desktop, 1-column mobile, 10 cards. Each card = the question text + a small "→" icon. Hover state = subtle lift + border highlight.
- **"What's different" section:** 4 cards in a 2x2 grid. Each = icon + 1-line title + 2-line description.
- **Footer:** "Built by Sarmad — Fractional AI engineer for SaaS founders. [Portfolio] [Twitter] [GitHub] [Book a call]"

### 9.2 Query UI
- **Layout:** 3-column on desktop (collapsible sidebar | main | results panel toggle). Single-column on mobile.
- **Left sidebar:** Schema tree, search box at top, PII toggle at bottom
- **Main area top:** Connection indicator (green dot + DB name + disconnect button)
- **Main area center:** Textarea (auto-grow, min 3 rows), submit button (Cmd+Enter shortcut hinted)
- **Below input:** History dropdown (last 10 queries)
- **Results panel:** Tabs = [Table | Chart | SQL | Reasoning]
  - Table tab: paginated, sortable, CSV export
  - Chart tab: auto-rendered, type dropdown
  - SQL tab: syntax-highlighted, copy button, "Edit & re-run" button
  - Reasoning tab: explanation + assumptions + confidence badge

### 9.3 States to design explicitly
- Empty state (no query yet)
- Loading state (LLM thinking — show what stage: "Generating SQL..." → "Validating..." → "Executing...")
- Unanswerable state (yellow info card)
- Validation-rejected state (red error card with SQL + reason)
- Execution-error state (red error card with "ask Claude to fix" button)
- No-results state (empty result table)
- Connection-dropped state (full-screen modal)

---

## 10. Security threat model

Format for the README's security table:

| Attack | Mitigation |
|---|---|
| LLM generates `DROP TABLE` | Postgres role is `default_transaction_read_only = on` — write attempts fail at the connection layer regardless of SQL |
| LLM generates expensive query that locks the DB | `statement_timeout = 10s`, `lock_timeout = 2s`, `EXPLAIN` pre-flight rejects queries above cost/row thresholds |
| LLM exfiltrates data via `pg_catalog.pg_authid` | SQL validator rejects any reference to `pg_*` or `information_schema` |
| Prompt injection in user question to leak schema | Schema is sent to LLM regardless; nothing to leak. Connection string is never in prompt context. |
| Prompt injection in DB data (e.g., a row containing "ignore previous instructions") | LLM sees only schema, never row data, when generating SQL |
| User submits SQL directly via "Edit SQL" to bypass LLM safety | Same validation pipeline applies to user-submitted SQL |
| Multi-statement SQL injection (`SELECT 1; DROP TABLE x;`) | Parser rejects multiple statements |
| PII leakage to third parties | PII detection + redaction default-on; raw values never sent to Anthropic |
| Connection string exposure via logs | Cookie is encrypted (AES-256-GCM); never logged; never persisted server-side |
| Stolen session cookie reuse | httpOnly + sameSite=strict + secure flag; rotation on disconnect |
| Unauthenticated access to self-hosted deploy | App refuses to start without `APP_PASSWORD`; middleware enforces on all routes |

### Out-of-scope security considerations (document honestly in SECURITY.md)
- DDoS / rate-limiting (deploy behind Cloudflare or a Vercel rate-limit middleware in v1.1)
- Cookie encryption key rotation (manual restart for v1)
- Audit logging of queries (not persisted — by design for v1)

---

## 11. Edge cases & error handling

| Case | Behavior |
|---|---|
| Schema has 0 tables | Show "schema is empty" message, suggest checking schema permissions |
| Schema has > 500 tables | Show filter UI, prompt user to narrow scope before LLM context-building |
| Question is empty / whitespace | Disable submit button |
| Question is > 2000 chars | Truncate with warning |
| Claude returns malformed tool use response | Retry once with stricter instruction; on second failure show error |
| Claude rate-limited (429) | Show specific "API rate limited, retry in N seconds" message |
| Claude returns SQL that doesn't parse | Reject at validator, show error with "ask Claude to fix" button |
| Result has 0 rows | Show "no results" with the SQL displayed prominently |
| Result has > 1000 rows | Already limited; show "showing first 1000 of N total" |
| Column type the chart engine doesn't understand | Hide chart tab |
| User disconnects mid-query | Cancel pending Claude call + DB query; show "disconnected" state |
| Cookie decryption fails (key rotated, tampered) | Force re-connect flow |
| Postgres SSL required but not configured | Show specific error + how-to-fix hint |
| Database connection drops between queries | Auto-reconnect once; on failure show connection-dropped modal |

---

## 12. Analytics & instrumentation

Lightweight, privacy-respecting. No user tracking on self-hosted deploys.

### Live demo only (talktomydb.dev)
Use Plausible or a simple PostHog setup, opt-out via DNT header.

Events:
- `landing_view` (with utm params)
- `example_clicked` (which example)
- `connect_attempted` (success/failure + error code, NO connection string)
- `query_submitted` (question length, NOT the question text)
- `query_succeeded` (executionMs, rowCount, chartType)
- `query_unanswerable`
- `query_rejected` (reason)
- `github_clicked`
- `calendly_clicked`
- `portfolio_clicked`

The only conversion metric that matters: `calendly_clicked` and `portfolio_clicked` from `landing_view` sessions.

---

## 13. Launch criteria (Day 6 checklist)

A merge to `main` and tag `v1.0.0` requires ALL of:

- [ ] All 5 representative tests pass in CI
- [ ] Live demo deployed to `talktomydb.dev` and reachable
- [ ] Live demo's sample DB has been pre-seeded and "ask the 10 examples" all succeed
- [ ] `docker compose up` from a clean clone produces a working app
- [ ] README has: hero GIF, what's-different section, quickstart, threat model table, ARCHITECTURE.md link, SECURITY.md link, "Built by" footer with Calendly link
- [ ] 90-second Loom recorded and embedded in README + uploaded to YouTube
- [ ] Security manual test pass: tried 10 attacks from the threat model, all blocked
- [ ] Lighthouse score on landing page: Performance ≥ 90, Accessibility ≥ 95
- [ ] Twitter post drafted, HN Show post drafted, LinkedIn post drafted
- [ ] First 5 cold outreach emails drafted with the demo as the hook

If any of these are missing, do not launch — slip to Day 7. **A botched launch is worse than a late one for a portfolio piece.**

---

## 14. Open questions (decide before Day 1)

1. **Database for the live demo:** Neon free tier vs Supabase free tier vs Railway? Neon is recommended (true serverless Postgres, cleanest UX, generous free tier).
2. **PII detector v1:** heuristics only, or include LLM classifier pass? Recommendation: ship heuristics in v1, add LLM pass in v1.1 if there's outreach traction.
3. **Auto-chart engine:** custom rules or use a library like `nivo`? Recommendation: custom rules (10 lines of code, full control).
4. **Loom recording:** record at end of Day 5 or start of Day 6? Recommendation: end of Day 5 — gives a buffer to re-record on Day 6 morning if needed.
5. **Anthropic API cost on the live demo:** estimate $0.01–0.05 per query at Sonnet 4.6 rates. With password gate + Plausible monitoring this is bounded; budget $50/mo and review weekly.

---

## 15. Post-v1 (do NOT build before v1 ships)

Captured here so they don't clutter v1:

- Multi-DB: MySQL, Snowflake, BigQuery
- Save/share queries via signed URLs
- Slack integration (the next demo project)
- Team workspaces + SSO
- Materialized result caching
- Streaming results
- Query cost preview before execution
- Schema diff alerts (when schema changes, invalidate cached examples)
- Fine-tuned model for SQL generation (only if metrics justify)
- "Suggest a follow-up question" after each result

---

## Appendix A: Pre-baked example questions for the live demo

Using the DVD Rental sample DB:

1. Which films generated the most rental revenue in the last quarter of 2005?
2. Show the top 10 customers by total amount spent
3. What's the average rental duration by film category?
4. Which actors appear in the most films?
5. Find customers who haven't rented anything in the last 30 days
6. What are the busiest rental days of the week?
7. Show me films that are rented frequently but rarely returned on time
8. Which staff member processed the most rentals?
9. What's the most popular film category in each store?
10. Compare monthly rental revenue between 2005 and 2006

These cover: aggregations, joins, time analysis, ranking, comparison — the SQL patterns that make the demo look impressive.

---

## Appendix B: System prompt for Claude (first draft)

```
You are a SQL expert that translates natural language questions into safe, read-only Postgres SQL.

You will be given:
- A data dictionary describing the available tables, columns, and relationships
- A natural language question

You MUST return a tool call with:
- sql: a single SELECT statement (no semicolons except at the end, no multiple statements)
- explanation: 1-2 sentences explaining what the query does in plain English
- confidence: "high", "medium", or "low"
- assumptions: list any non-obvious interpretations you made (e.g., "assumed 'last quarter' means Q4 of the most recent year in the data")
- unanswerable_reason: ONLY populate this if the schema cannot answer the question, in which case return empty sql

Rules:
- NEVER reference tables or columns not in the data dictionary. If you need data that isn't there, set unanswerable_reason.
- NEVER generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE, COPY, CALL, DO, or MERGE.
- NEVER reference pg_catalog, information_schema, or any pg_* system tables.
- Prefer explicit JOINs using the foreign keys in the data dictionary.
- Add appropriate LIMIT clauses for queries that could return many rows.
- For time-based questions, use the most appropriate timestamp column in the data dictionary.
- If you must make assumptions, choose the most reasonable interpretation and list it in assumptions — do not ask for clarification.
```
