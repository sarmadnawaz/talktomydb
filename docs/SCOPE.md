# Demo Project #1 — Scope

**Name:** TalkToMyDB
**Domain:** talktomydb.dev

**One-line pitch:** "Production-grade text-to-SQL for Postgres. Read-only, guardrailed, schema-aware. Built for teams that don't trust 'connect ChatGPT to your DB' demos."

---

## Why this version stands out (this is the whole game)

The text-to-SQL space is crowded with toys: LangChain demos, hackathon projects, half-baked SaaS. They all fail in the same predictable ways — they hallucinate columns, generate `DROP TABLE` happily, time out on big tables, and ignore that real schemas have 200+ tables.

**Your differentiation is "this looks like real engineers built it for production use, not a weekend hack."** That maps directly to what a senior eng-for-hire signals to a buyer. Four concrete differentiators to bake in:

1. **Real guardrails** — enforced read-only connection role (not just a system prompt asking the LLM nicely), query timeouts, row limit caps, automatic `EXPLAIN` before execution to reject expensive queries, PII column auto-detection with redaction toggle
2. **Schema intelligence** — full introspection (tables, columns, FKs, comments, indexes), build a compact "data dictionary" passed in context, use FK relationships to infer joins
3. **Honest uncertainty** — model is instructed to say "the schema doesn't support this question" instead of guessing. Show confidence + the reasoning trace.
4. **Actually deployable** — `docker compose up` works. README has a "deploy to your own infra in 5 min" path. This alone puts you in the top 5% of GitHub AI demos.

The README + Loom should explicitly call out "I built this because every text-to-SQL demo I tried in production was unsafe." That positions you as the senior who's seen prod systems break.

---

## Locked tech decisions (don't re-debate these)

- **Frontend:** Next.js 15 (App Router) + shadcn/ui + Tailwind
- **Backend:** Next.js API routes (keep it one deployable)
- **LLM:** Anthropic Claude Sonnet 4.6 (cheap + great at SQL, faster than Opus for this)
- **DB driver:** `pg` (node-postgres), connection pooling via `pg-pool`
- **Charts:** Recharts (auto-pick chart type from result shape)
- **Auth:** None for v1 — single-tenant demo, password-gate the deployed instance with a basic env-var password
- **Deploy:** Vercel for the demo, Docker for the "deploy your own" path
- **Sample DB for the demo:** [DVD Rental Postgres sample](https://www.postgresqltutorial.com/postgresql-getting-started/postgresql-sample-database/) — 15 tables, recognizable domain, FKs everywhere. Pre-seed into a Neon free instance for the live demo.

---

## 6-day build plan

### Day 1 — Foundation + schema introspection
- Next.js scaffold, shadcn install, deploy "hello world" to Vercel (don't skip — proves the deploy pipeline works)
- Connection form: paste a `postgres://...` URL, server stores in encrypted session cookie
- Build the schema introspector: query `information_schema` + `pg_catalog` to extract tables, columns, types, PKs, FKs, comments, row counts
- Render the schema as a collapsible tree in the sidebar
- **End-of-day deliverable:** Paste a connection string, see the full schema tree

### Day 2 — Query generation + execution
- Build the LLM prompt: schema context + user question + strict instructions (read-only, output JSON with `sql`, `explanation`, `confidence`, `unanswerable_reason`)
- Use Claude's tool use to force structured output
- Build the read-only connection wrapper: spawn a separate `pg` client with `SET TRANSACTION READ ONLY` + `SET statement_timeout = '10s'` + `SET lock_timeout = '2s'`
- Execute generated SQL, return results as JSON
- **End-of-day deliverable:** Type a question, get SQL + results in a table

### Day 3 — Guardrails + safety
- Pre-flight `EXPLAIN` on generated SQL, reject if estimated cost > threshold or rows > 100K
- Implement PII detector: regex + column-name heuristics (`email`, `phone`, `ssn`, `*_token`, etc.) + an optional LLM pass. Add a "redact PII" toggle in UI.
- Add SQL validator: parse with `pgsql-parser`, reject any non-SELECT, reject queries touching pg_catalog
- Add query history with re-run + edit-SQL-and-re-run buttons
- **End-of-day deliverable:** Try to break it. Document the attacks it blocks in the README.

### Day 4 — Charts + polish
- Auto-detect chart type from result shape (1 numeric col + 1 date → line; 2 cols numeric/categorical → bar; etc.). Recharts.
- "Why this SQL?" expandable showing model's reasoning trace
- Loading states, error states, empty states. shadcn skeletons everywhere.
- Keyboard shortcuts (Cmd+Enter to run, Cmd+K to focus input)
- Dark mode
- **End-of-day deliverable:** Looks like a product, not a demo

### Day 5 — Deployability + docs
- Dockerfile + docker-compose.yml (web + optional sample postgres)
- README: hero gif, 3-min quickstart, architecture diagram, "the 4 things that make this different," security threat model, env vars table, contributing
- Set up the live demo: pre-seeded Neon DB + deployed Vercel + password-gate
- Add 10 pre-baked example questions on the landing page so visitors can click-and-try
- **End-of-day deliverable:** Repo is shippable

### Day 6 — Launch
- Record the 90-second Loom (script below)
- Write the launch post (HN, Reddit r/SideProject + r/dataengineering, LinkedIn, Twitter/X, Hacker News Show HN)
- Submit to Anthropic's "Built with Claude" gallery
- Post on Indie Hackers
- DM 10 founders in your outreach list with the link as the first contact

---

## The 90-second Loom script

> [0–10s] "Every text-to-SQL demo I've tried fails the same way in production. They hallucinate columns, generate destructive queries, and ignore that real schemas have hundreds of tables. So I built TalkToMyDB to do this safely."
>
> [10–35s] "I'm connected to a sample Postgres DB — 15 tables, foreign keys, the works. I'll ask: *which films generated the most rental revenue last quarter?* Notice it figures out the join across rental, payment, inventory, and film tables, and shows me the SQL it generated with its reasoning."
>
> [35–60s] "Now watch what happens if I ask something the schema can't answer — *show me customer churn risk*. It says: 'the schema doesn't have churn signals, here's what's missing.' That's the bit most demos skip. And if I try to make it run something destructive — *delete all the rentals* — it blocks it at the connection layer, not just the prompt."
>
> [60–85s] "Every query goes through EXPLAIN first to reject expensive ones, PII columns are auto-detected and redacted by default, and the whole thing is `docker compose up` to deploy on your own infra. Repo's in the description."
>
> [85–90s] "I build production AI features for SaaS teams. Link in the description if you want to talk."

---

## README outline (write this on Day 5)

1. **Hero:** Animated gif, one-line pitch, 3 badges (deploy, license, twitter)
2. **The problem** (3 sentences max — set the tone)
3. **What's different** (the 4 differentiators, one paragraph each)
4. **Try it:** Live demo link with password
5. **Quickstart:** `docker compose up`, env vars, 60 seconds to running
6. **Architecture:** One diagram. Connection flow + safety layers.
7. **Security threat model:** Table of "attack → how we block it." This builds enormous trust.
8. **What's NOT in v1:** Be honest. Multi-DB, write queries, fine-tuning, auth — all listed as "future." Honesty is rare and signals seniority.
9. **Built by:** One-paragraph bio with portfolio link + Calendly. **This is the conversion point.**

---

## Distribution plan (Day 6)

Order matters — start with the slowest-burn, end with the highest-leverage:

1. Submit to Show HN (1pm ET Wed/Thu best)
2. Post on r/SideProject + r/dataengineering + r/PostgreSQL
3. Post LinkedIn (carousel: problem → solution → 4 screenshots → CTA)
4. Tweet thread (5 tweets, end with Loom)
5. Submit to Anthropic "Built with Claude"
6. DM 10 founders from outreach list with this as warm opener

Target: 1,000 GitHub views in week 1, 50 stars, 3 inbound DMs about contract work. That last number is the only one that matters.

---

## Success criteria (be honest with yourself)

The demo project succeeds if, when a founder lands on it from a cold email, they think: **"this person could ship the AI feature in our product."** Not: "cool side project."

Everything in this scope is in service of that one reaction.
