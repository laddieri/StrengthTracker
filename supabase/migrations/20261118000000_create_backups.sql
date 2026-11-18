-- Cloud backup tables for StrengthTracker.
create table public.backups (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state jsonb not null,
  sessions int not null default 0,
  device text,
  updated_at timestamptz not null default now()
);

create table public.backup_history (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  state jsonb not null,
  sessions int not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.backups enable row level security;
alter table public.backup_history enable row level security;

create policy "select own backup" on public.backups for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own backup" on public.backups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own backup" on public.backups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own backup" on public.backups for delete to authenticated using ((select auth.uid()) = user_id);

create policy "select own history" on public.backup_history for select to authenticated using ((select auth.uid()) = user_id);

-- Keep one snapshot per user per day (the day's copy with the most history), last 30 days.
create or replace function public.snapshot_backup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.backup_history (user_id, day, state, sessions, saved_at)
  values (new.user_id, (now() at time zone 'utc')::date, new.state, new.sessions, now())
  on conflict (user_id, day) do update
    set state = excluded.state, sessions = excluded.sessions, saved_at = excluded.saved_at
    where excluded.sessions >= public.backup_history.sessions;
  delete from public.backup_history
    where user_id = new.user_id and day < (now() at time zone 'utc')::date - 30;
  return new;
end;
$$;

revoke execute on function public.snapshot_backup() from public, anon, authenticated;

create trigger backups_snapshot
after insert or update on public.backups
for each row execute function public.snapshot_backup();
