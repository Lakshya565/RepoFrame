-- ============================================================================
-- Phase 15 — initial schema: saved projects, generated outputs, claim
-- verifications, usage ledger, and the GitHub App installation mapping.
--
-- Run this once in the Supabase SQL editor (or via the Supabase CLI) against a
-- fresh project. It is idempotent-friendly for the create statements (IF NOT
-- EXISTS) but the RLS policies are dropped-then-created so re-running stays clean.
--
-- Security model (see PHASE_15_PLAN.md §4):
--   * RLS is ON for every table.
--   * User-owned tables allow a row only when it belongs to the calling user
--     (auth.uid()). The backend uses the SERVICE-ROLE key, which BYPASSES RLS, so
--     these policies are defense-in-depth for any client (anon/authenticated) key
--     — never the sole guard. Backend code still scopes every query by user_id.
--   * user_installations has RLS enabled but NO policy, so client roles can read
--     nothing; only the service-role backend touches it. It maps a Supabase user
--     to a GitHub App installation and must never leak across users.
--   * No GitHub or Supabase token is ever stored. Installation tokens are minted
--     per-request and discarded (Phase 15.4/15.5); only the non-secret
--     installation_id lives here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- projects — one row per saved repo analysis, unique per (user, repo URL).
-- Holds the repo metadata snapshot and the user's questionnaire context so a
-- saved project can be reopened without re-fetching.
-- ----------------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repo_owner text not null,
  repo_name text not null,
  normalized_url text not null,
  default_branch text,
  is_private boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,          -- RepoMetadataResponse snapshot
  user_context jsonb not null default '{}'::jsonb,      -- UserContext snapshot
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);

-- ----------------------------------------------------------------------------
-- generated_outputs — the latest generated writeup for a project (one row per
-- project; regenerating overwrites). Cascades away with its parent project.
-- ----------------------------------------------------------------------------
create table if not exists generated_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile jsonb,
  resume_bullets jsonb,
  readme_intro text,
  portfolio_blurb text,
  linkedin_description text,
  interview_topics jsonb,
  all_guidance text default '',
  updated_at timestamptz not null default now(),
  unique (project_id)
);

-- ----------------------------------------------------------------------------
-- claim_verifications — the latest agentic verification result for a project
-- (one row per project). Cascades away with its parent project.
-- ----------------------------------------------------------------------------
create table if not exists claim_verifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  verifications jsonb not null default '[]'::jsonb,
  model text,
  updated_at timestamptz not null default now(),
  unique (project_id)
);

-- ----------------------------------------------------------------------------
-- usage_metrics — append-only token ledger that replaces backend/data/usage.json
-- once configured (Phase 15.7). user_id/project_id are nullable and set null on
-- delete so history survives the deletion of the user or project it refers to.
-- ----------------------------------------------------------------------------
create table if not exists usage_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  reasoning_tokens int not null default 0,
  total_tokens int not null default 0,
  recorded_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- user_installations — maps a Supabase user to their GitHub App installation.
-- github_account_id must match the user's GitHub identity id (ownership binding,
-- enforced in code on the install callback). No token is stored here.
-- ----------------------------------------------------------------------------
create table if not exists user_installations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  installation_id bigint not null,
  github_account_id bigint not null,          -- must equal the user's GitHub identity id
  account_login text,
  repo_selection text,                        -- 'all' | 'selected'
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table projects            enable row level security;
alter table generated_outputs   enable row level security;
alter table claim_verifications enable row level security;
alter table usage_metrics       enable row level security;
alter table user_installations  enable row level security;

-- projects: a user may only see/act on their own rows.
drop policy if exists projects_owner on projects;
create policy projects_owner on projects
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- generated_outputs: no user_id column; ownership is inherited through the parent
-- project. A row is visible/writable only when its project belongs to the caller.
drop policy if exists generated_outputs_owner on generated_outputs;
create policy generated_outputs_owner on generated_outputs
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = generated_outputs.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = generated_outputs.project_id and p.user_id = auth.uid()
    )
  );

-- claim_verifications: same inherited-ownership rule as generated_outputs.
drop policy if exists claim_verifications_owner on claim_verifications;
create policy claim_verifications_owner on claim_verifications
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = claim_verifications.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = claim_verifications.project_id and p.user_id = auth.uid()
    )
  );

-- usage_metrics: a user may read their own ledger rows. Inserts come from the
-- service-role backend (which bypasses RLS), so no insert policy is granted to
-- client roles — the ledger cannot be forged from the frontend.
drop policy if exists usage_metrics_owner_read on usage_metrics;
create policy usage_metrics_owner_read on usage_metrics
  for select
  using (user_id = auth.uid());

-- user_installations: intentionally NO policy. With RLS enabled and no policy,
-- every client role is denied all access; only the service-role backend can read
-- or write the user <-> installation mapping.

-- ============================================================================
-- Table privileges (GRANTs)
-- ============================================================================
-- PostgREST executes each request as the Postgres role the API key maps to, and
-- that role must hold table-level privileges BEFORE RLS is even consulted. This
-- project's default privileges did not grant new SQL-editor tables to
-- service_role, so we grant explicitly (idempotent, and portable across projects
-- whose defaults differ).
--
-- Architecture note — DB access is BACKEND-ONLY: the FastAPI backend performs
-- every query with the service-role (secret) key; the frontend never queries
-- these tables directly (it uses Supabase Auth via the anon key + our own API).
-- So the client roles (anon / authenticated) intentionally receive NO direct
-- table privileges here — an extra hard wall in front of the data. The RLS
-- policies above are kept as forward-looking defense-in-depth: they take effect
-- automatically IF a future change ever grants a client role direct access.
grant all privileges on table
  projects,
  generated_outputs,
  claim_verifications,
  usage_metrics,
  user_installations
  to service_role;
