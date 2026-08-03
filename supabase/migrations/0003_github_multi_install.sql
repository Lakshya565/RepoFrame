-- Support more than one GitHub App installation per RepoFrame user and retain
-- the encrypted, expiring GitHub user authorization needed to revalidate access
-- to organization repositories. Both tables remain backend-only: RLS is enabled
-- with no client policy and only the service role receives table privileges.

alter table user_installations
  drop constraint if exists user_installations_pkey;

alter table user_installations
  add column if not exists account_type text not null default 'User',
  add column if not exists settings_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_installations_account_type_check'
      and conrelid = 'user_installations'::regclass
  ) then
    alter table user_installations
      add constraint user_installations_account_type_check
      check (account_type in ('User', 'Organization'));
  end if;
end $$;

alter table user_installations
  add primary key (user_id, installation_id);

create index if not exists user_installations_installation_id_idx
  on user_installations (installation_id);

create table if not exists github_user_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table github_user_authorizations enable row level security;

revoke all privileges on table
  user_installations,
  github_user_authorizations
  from anon, authenticated;

grant all privileges on table
  user_installations,
  github_user_authorizations
  to service_role;
