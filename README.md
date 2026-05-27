# TalkToMyDB

> Production-grade text-to-SQL for Postgres. Read-only, guardrailed, schema-aware.

Most text-to-SQL demos hallucinate columns, happily generate `DROP TABLE`, and
ignore that real schemas have hundreds of tables. **TalkToMyDB is built to be
the one you'd actually point at a production read-replica.**

## Status

In active development. See [`docs/SCOPE.md`](./docs/SCOPE.md) for the 6-day
build plan and [`docs/PRD.md`](./docs/PRD.md) for the full product requirements.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Postgres via `pg`
- Anthropic Claude for SQL generation
- Recharts for auto-rendered result charts
- Deploys to Vercel; ships as `docker compose up` for self-hosting

## Local development

```bash
pnpm install
pnpm dev
```

A polished README — quickstart, architecture diagram, security threat model —
lands in the Day 5 milestone (see scope doc).
