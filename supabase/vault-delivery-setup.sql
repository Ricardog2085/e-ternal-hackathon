-- =====================================================================
-- E-ternal: bóveda por persona + agente + entrega (Fases 1-3)
-- Ejecutar en Supabase > SQL Editor. Orden:
--   PARTE A (ahora): tablas + columnas + RLS.
--   PARTE B (después de desplegar las Edge Functions y sus secretos):
--   extensiones + secretos Vault + trabajo programado diario.
-- Todo es idempotente: se puede re-ejecutar sin duplicar nada.
-- =====================================================================

-- ------------------------- PARTE A: tablas ----------------------------

create extension if not exists pgcrypto;

-- Destinatarios de la bóveda (Fase 1)
create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  relation text,
  phone text,
  created_at timestamptz not null default now()
);

-- Familia memorizada por el agente (Fase 2)
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  relation text,
  birthdate date,
  notes text,
  created_at timestamptz not null default now()
);

-- Progreso de la entrevista (Fase 2)
create table if not exists public.interview_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  topics_done text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Custodio que puede activar la entrega post-mortem (Fase 3)
create table if not exists public.custodians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  email text,
  phone text,
  status text not null default 'nominated',
  activated_at timestamptz,
  waiting_until timestamptz,
  vetoed boolean not null default false,
  executed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Entregas por recuerdo y destinatario (Fase 3)
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  memory_id text not null,
  recipient_id uuid not null references public.recipients (id) on delete cascade,
  status text not null default 'pending',
  attempts int not null default 0,
  scheduled_for timestamptz,
  sent_at timestamptz,
  last_error text,
  log text,
  created_at timestamptz not null default now(),
  unique (user_id, memory_id, recipient_id)
);

-- Enlace recuerdo -> destinatario (Fase 1)
alter table public.memories
  add column if not exists recipient_id uuid references public.recipients (id) on delete set null;

-- Condición de entrega escrita desde el formulario (Fase 1, corrige pérdida de datos)
alter table public.memories
  add column if not exists unlock_condition text;

-- ------------------------- PARTE A: RLS --------------------------------

alter table public.recipients enable row level security;
alter table public.family_members enable row level security;
alter table public.interview_state enable row level security;
alter table public.custodians enable row level security;
alter table public.deliveries enable row level security;

drop policy if exists "recipients_own" on public.recipients;
create policy "recipients_own" on public.recipients
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_members_own" on public.family_members;
create policy "family_members_own" on public.family_members
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "interview_state_own" on public.interview_state;
create policy "interview_state_own" on public.interview_state
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "custodians_own" on public.custodians;
create policy "custodians_own" on public.custodians
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "deliveries_own" on public.deliveries;
create policy "deliveries_own" on public.deliveries
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Verificación rápida de la Parte A (debe listar las 5 tablas con RLS):
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--   and tablename in ('recipients','family_members','interview_state','custodians','deliveries');

-- =====================================================================
-- PARTE B: programar el reparto diario (Fase 3).
-- Requisitos previos:
--   1. Funciones desplegadas: interview, dispatch-deliveries
--      (Supabase > Edge Functions > New function > pegar el código de
--      supabase/functions/<nombre>/index.ts > Deploy).
--   2. Secretos de funciones (Edge Functions > Secrets):
--      - interview: MODEL_API_KEY (tu clave de Meta Model API)
--      - interview (opcional): MODEL_ID (por defecto muse-spark-1.3)
--      - dispatch-deliveries: CRON_SECRET (un texto largo aleatorio que
--        inventes), DEMO_MODE=true (cámbialo a false solo en Fase 4)
--   3. Habilitar extensiones: Database > Extensions > pg_cron y pg_net.
-- Luego ejecuta este bloque (reemplaza los <...> solo en TU editor,
-- jamás compartas estas claves):
-- =====================================================================

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

-- select vault.create_secret('https://pqtdedacvnqoyqfaikrh.supabase.co', 'project_url');
-- select vault.create_secret('<TU-SERVICE-ROLE-KEY>', 'service_key');
-- select vault.create_secret('<TU-CRON-SECRET-IGUAL-AL-DE-LA-FUNCION>', 'cron_secret');

-- select cron.schedule(
--   'dispatch-deliveries-daily',
--   '*/15 * * * *', -- cada 15 minutos (envío puntual a la hora programada)
--   $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
--       || '/functions/v1/dispatch-deliveries',
--     headers := jsonb_build_object(
--       'Content-type', 'application/json',
--       'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_key'),
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     body := '{"action":"dispatch"}'::jsonb
--   ) as request_id;
--   $$
-- );

-- Ver trabajos programados: select * from cron.job;
-- Ver historial: select * from cron.job_run_details order by start_time desc limit 10;
-- Desactivar: select cron.unschedule('dispatch-deliveries-daily');
