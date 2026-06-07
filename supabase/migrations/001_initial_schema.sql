create extension if not exists "pgcrypto";

create type public.user_role as enum ('user', 'schlichter');
create type public.booking_status as enum ('angefragt', 'bestaetigt', 'klaerung', 'storniert', 'abgelehnt');

create table public.family_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  full_name text,
  email text not null unique,
  family_party_id uuid references public.family_parties(id),
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  family_party_id uuid not null references public.family_parties(id),
  created_by uuid not null,
  start_date date not null,
  end_date date not null,
  is_priority boolean not null default false,
  shared_stay_allowed boolean not null default false,
  status public.booking_status not null default 'angefragt',
  comment text,
  notice_period_ends_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_date_order check (end_date >= start_date)
);

create table public.objections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  created_by uuid not null,
  reason text not null check (char_length(reason) >= 3),
  created_at timestamptz not null default now()
);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type text not null,
  message text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null
);

create index bookings_dates_idx on public.bookings(start_date, end_date);
create index bookings_status_idx on public.bookings(status);
create index profiles_user_id_idx on public.profiles(user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_bookings_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_profile_party_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select family_party_id from public.profiles where user_id = auth.uid() limit 1;
$$;

create or replace function public.guard_booking_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() = 'schlichter' then
    return new;
  end if;

  if old.created_by = auth.uid() and new.status = 'storniert' then
    return new;
  end if;

  if old.created_by = auth.uid()
     and new.status = old.status
     and new.family_party_id = old.family_party_id
     and new.created_by = old.created_by then
    return new;
  end if;

  raise exception 'Nur eigene Stornierungen sind erlaubt.';
end;
$$;

create trigger guard_booking_status_update
before update on public.bookings
for each row execute function public.guard_booking_status_update();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.email, ''),
    case when lower(coalesce(new.email, '')) in ('peter@example.com', 'carmen@example.com') then 'schlichter'::public.user_role else 'user'::public.user_role end
  )
  on conflict (email) do update set
    user_id = excluded.user_id,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.family_parties enable row level security;
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.objections enable row level security;
alter table public.booking_events enable row level security;
alter table public.app_settings enable row level security;

create policy "Angemeldete sehen Familienparteien" on public.family_parties for select to authenticated using (true);
create policy "Schlichter verwalten Familienparteien" on public.family_parties for all to authenticated using (public.current_profile_role() = 'schlichter') with check (public.current_profile_role() = 'schlichter');

create policy "Angemeldete sehen Profile" on public.profiles for select to authenticated using (true);
create policy "Eigenes Profil anlegen" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "Schlichter legen Profile an" on public.profiles for insert to authenticated with check (public.current_profile_role() = 'schlichter');
create policy "Schlichter verwalten Profile" on public.profiles for update to authenticated using (public.current_profile_role() = 'schlichter') with check (public.current_profile_role() = 'schlichter');

create policy "Angemeldete sehen Buchungen" on public.bookings for select to authenticated using (true);
create policy "Eigene Partei erstellt Buchungen" on public.bookings for insert to authenticated with check (family_party_id = public.current_profile_party_id() and created_by = auth.uid());
create policy "Eigene Buchungen aktualisieren" on public.bookings for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "Schlichter aktualisieren Buchungen" on public.bookings for update to authenticated using (public.current_profile_role() = 'schlichter') with check (public.current_profile_role() = 'schlichter');

create policy "Angemeldete sehen Widersprüche" on public.objections for select to authenticated using (true);
create policy "Andere Partei widerspricht" on public.objections for insert to authenticated with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and b.status = 'angefragt'
      and b.family_party_id <> public.current_profile_party_id()
  )
);

create policy "Angemeldete sehen Verlauf" on public.booking_events for select to authenticated using (true);
create policy "Angemeldete schreiben Verlauf" on public.booking_events for insert to authenticated with check (created_by = auth.uid() or created_by is null);

create policy "Angemeldete sehen Einstellungen" on public.app_settings for select to authenticated using (true);
create policy "Schlichter verwalten Einstellungen" on public.app_settings for all to authenticated using (public.current_profile_role() = 'schlichter') with check (public.current_profile_role() = 'schlichter');

insert into public.app_settings (key, value)
values ('september_rule_enabled', 'true')
on conflict (key) do nothing;
