-- כיבוש הממלכות — טבלת תוצאות וטבלת אלופים בפרויקט Supabase של pogona (כמו tower_scores).
-- מריצים פעם אחת ב-SQL Editor. רק הוספה, לא נוגע בטבלאות קיימות.
create table if not exists public.conquest_scores (
  id bigint generated always as identity primary key,
  device text not null check (device ~ '^[a-z0-9]{8,40}$'),
  name text not null check (char_length(name) between 1 and 16),
  won boolean not null default false,
  place smallint not null check (place between 1 and 8),
  players smallint not null check (players between 2 and 8),
  humans smallint not null check (humans between 1 and 8),
  secs real not null check (secs >= 0 and secs <= 86400),
  regions smallint not null default 0 check (regions between 0 and 100),
  captured integer not null default 0 check (captured between 0 and 10000),
  diff smallint not null default 1 check (diff between 0 and 2),
  mode text not null default 'solo' check (mode in ('solo','mp')),
  version text check (char_length(version) <= 20),
  created_at timestamptz not null default now()
);
alter table public.conquest_scores enable row level security;
create policy "conquest_scores insert" on public.conquest_scores for insert to anon, authenticated with check (true);
create policy "conquest_scores read" on public.conquest_scores for select to anon, authenticated using (true);
create index if not exists conquest_scores_device_idx on public.conquest_scores (device, created_at desc);

create or replace function public.conquest_rate_limit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  select count(*) into n from public.conquest_scores where device = new.device and created_at > now() - interval '1 hour';
  if n >= 30 then raise exception 'rate limit'; end if;
  return new;
end $$;
create trigger conquest_scores_rate before insert on public.conquest_scores for each row execute function public.conquest_rate_limit();

create or replace view public.conquest_leaderboard with (security_invoker = true) as
select device,
       (array_agg(name order by created_at desc))[1] as name,
       count(*)::int as games,
       count(*) filter (where won)::int as wins,
       min(secs) filter (where won) as best_secs
from public.conquest_scores
group by device;
grant select on public.conquest_leaderboard to anon, authenticated;
grant select, insert on public.conquest_scores to anon, authenticated;
