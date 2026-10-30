-- AXE-507 : historique des connexions, visible uniquement via l'API admin.
-- Conservation : 12 mois. La purge est faite à l'enregistrement d'une connexion.
-- Pas d'e-mail dans cette table.

create table if not exists public.user_sign_ins (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  signed_in_at timestamptz not null default now()
);

create index if not exists user_sign_ins_user_signed_idx
  on public.user_sign_ins (user_id, signed_in_at desc);

alter table public.user_sign_ins enable row level security;
drop policy if exists "Service role full access user_sign_ins" on public.user_sign_ins;
create policy "Service role full access user_sign_ins"
  on public.user_sign_ins
  for all
  to service_role
  using (true)
  with check (true);
