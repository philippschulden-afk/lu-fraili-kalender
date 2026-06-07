create table if not exists public.priority_day_forfeitures (
  id uuid primary key default gen_random_uuid(),
  family_party_id uuid not null references public.family_parties(id),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  year integer not null,
  forfeited_days integer not null check (forfeited_days > 0),
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint priority_day_forfeitures_unique_reason unique (booking_id, reason)
);

create index if not exists priority_day_forfeitures_party_year_idx
on public.priority_day_forfeitures(family_party_id, year);

alter table public.priority_day_forfeitures enable row level security;

create policy "Angemeldete sehen verfallene P-Tage"
on public.priority_day_forfeitures
for select
to authenticated
using (true);

create policy "Schlichter verwalten verfallene P-Tage"
on public.priority_day_forfeitures
for all
to authenticated
using (public.current_profile_role() = 'schlichter')
with check (public.current_profile_role() = 'schlichter');
