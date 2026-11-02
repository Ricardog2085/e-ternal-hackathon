# E-ternal — Post-mortem legacy vault for seniors

E-ternal is a private digital vault where older adults record videos, voice notes, and letters for their loved ones, guided by an AI interviewer with persistent family memory, and delivered post-mortem over WhatsApp through a custodian + waiting-period + veto flow.

Built for the **Meta Global AI Developer Hackathon** — track **Build for Your World**.

## Built during the hackathon (Oct 26 – Nov 4)

- **AI legacy guide** (`supabase/functions/interview`): Meta Model API (`muse-spark-1.3`) with tool calling — warm Spanish interviewer for seniors that saves/loads family facts (names, relations, birthdays, messages) to `family_members`, tracks progress in `interview_state`, controls reasoning cost via `reasoning_effort`, and never breaks live (plain-text retry → conversational local fallback with no-junk extraction and anti-duplicate upserts).
- **Post-mortem delivery engine** (`supabase/functions/dispatch-deliveries`): custodian activation, exact date+time scheduling, waiting period, owner veto, daily/15-min `pg_cron` dispatch, per-memory release dates, demo mode switch.
- **WhatsApp delivery, two modes**: Cloud API (utility template + media follow-up message with 7-day signed URLs) and custodian one-tap `wa.me` mode (no API needed).
- **Vault UX for seniors**: vault by person (`recipients`), filter tabs (All/Videos/Voice/Letters), big touch targets, honest states for expired media.

Pre-existing foundation (not showcased as new): email + Facebook login via Supabase Auth, RLS isolation, private Storage bucket with signed URLs.

## Stack

React 19 + TypeScript + Vite + Tailwind · Supabase (Auth, Postgres + RLS, Storage, Edge Functions, pg_cron, Vault) · Meta Model API (chat completions + tools).

## Setup

```bash
npm install
cp .env.example .env   # then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5173
```

Database (Supabase SQL Editor, in order):

1. `supabase/security-setup.md` — `user_id` + RLS on `memories`, private `vault` bucket policies.
2. `supabase/vault-delivery-setup.sql` — Part A: recipients, family_members, interview_state, custodians, deliveries + RLS. Part B (after deploying functions): `pg_cron` + `pg_net` + Vault secrets + daily schedule.

Edge Functions (dashboard or CLI): deploy `supabase/functions/interview` and `supabase/functions/dispatch-deliveries`, then set Secrets:

| Secret | Used by | Value |
|---|---|---|
| `MODEL_API_KEY` | interview | Meta Model API key (`LLM_...`) |
| `MODEL_ID` | interview (optional) | default `muse-spark-1.3` |
| `MODEL_REASONING` | interview (optional) | `minimal` (fast/cheap) or `low` |
| `CRON_SECRET` | dispatch | long random string (must match Vault `cron_secret`) |
| `DEMO_MODE` | dispatch | `true` (simulate) / `false` (real WhatsApp) |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_TEMPLATE` | dispatch (real mode) | Cloud API token, phone ID, text-only `es` template with 2 variables |

## 5-minute demo script

1. Log in with email → vault with tabs and dated memories.
2. Guide chat: "Tengo 2 hijos, Ana y Luis" → replies, saves, then ask "¿qué recuerdas de mi familia?" (memory proof from DB).
3. Delivery: designate custodian → program date/time → run dispatch → `deliveries` flip to `sent`.
4. Per-delivery green **WhatsApp** button (or per-video button) → real message with video link arrives.
5. Veto button cancels a pending delivery.

## Security model

Row Level Security per user on all tables · private `vault` bucket (`{userId}/...`) with folder-scoped policies · short-lived signed URLs (1h reads, 7d delivery) · `MODEL_API_KEY`/`WHATSAPP_TOKEN`/service keys server-side only, never `VITE_` · JWT-scoped Edge Functions.

## Scripts

- `npm run dev` — dev server · `npm run build` — typecheck + production build · `npm run lint` — oxlint
