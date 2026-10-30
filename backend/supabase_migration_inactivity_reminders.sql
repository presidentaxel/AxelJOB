-- AXE-508 : journal des mails de rappel de résiliation.
-- Une ligne = un envoi (rappel ou test). Pas d'adresse, pas le corps du mail.
-- kind = reminder : compte dans le calcul « un seul mail par période d'inactivité ».
-- kind = test : envoi interne, ignoré pour ce calcul.

create table if not exists public.inactivity_reminder_sends (
  id bigint generated always as identity primary key,
  user_id text not null,
  sent_at timestamptz not null default now(),
  kind text not null default 'reminder' check (kind in ('reminder', 'test'))
);

create index if not exists inactivity_reminder_sends_user_idx
  on public.inactivity_reminder_sends (user_id, sent_at desc);

alter table public.inactivity_reminder_sends enable row level security;
drop policy if exists "Service role full access inactivity_reminder_sends"
  on public.inactivity_reminder_sends;
create policy "Service role full access inactivity_reminder_sends"
  on public.inactivity_reminder_sends
  for all
  to service_role
  using (true)
  with check (true);
