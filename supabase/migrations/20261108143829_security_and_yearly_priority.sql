begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create or replace function private.has_family_access()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles
    where user_id = auth.uid() and (family_party_id is not null or role = 'schlichter'));
$$;
revoke all on function private.has_family_access() from public, anon;
grant execute on function private.has_family_access() to authenticated, service_role;

-- All mutations use checked server routes, including profile assignments and history.
revoke insert, update, delete on public.profiles, public.booking_events,
  public.family_parties, public.app_settings from anon, authenticated;
drop policy if exists "Eigenes Profil anlegen" on public.profiles;
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies where schemaname='public'
    and tablename in ('profiles','bookings','family_parties','objections','booking_events','app_settings','priority_day_forfeitures')
    and cmd <> 'SELECT' loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;

drop policy if exists "Angemeldete sehen Profile" on public.profiles;
create policy "Freigegebene Familie oder eigenes Profil" on public.profiles
  for select to authenticated using (user_id = auth.uid() or private.has_family_access());

do $$
declare t text; p record;
begin
  foreach t in array array['bookings','family_parties','objections','booking_events','app_settings','priority_day_forfeitures'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "Freigegebene Familie liest" on public.%I for select to authenticated using (private.has_family_access())', t);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles(user_id, full_name, email, role)
  values (new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.email, ''), 'user')
  on conflict (email) do update set user_id = excluded.user_id,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.current_profile_role() from public, anon, authenticated;
revoke all on function public.current_profile_party_id() from public, anon, authenticated;
grant execute on function public.current_profile_role(), public.current_profile_party_id() to service_role;

create or replace function public.guard_last_schlichter()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'schlichter' and (tg_op = 'DELETE' or new.role <> 'schlichter') then
    perform pg_advisory_xact_lock(617287150012::bigint);
    if not exists (select 1 from public.profiles where role = 'schlichter' and id <> old.id) then
      raise exception 'Es muss mindestens ein Schlichter bestehen bleiben.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_last_schlichter() from public, anon, authenticated;
create trigger guard_last_schlichter before update or delete on public.profiles
  for each row execute function public.guard_last_schlichter();

-- Patch only the quota block of the previously deployed, atomic booking function.
do $migration$
declare
  definition text := pg_get_functiondef('public.save_booking(uuid,uuid,jsonb,boolean,boolean,timestamptz)'::regprocedure);
  old_block text := $old$
    v_year := extract(year from v_new.start_date)::integer;
    v_party := v_new.family_party_id;
    select coalesce(sum(b.end_date - b.start_date + 1), 0) into v_used
      from public.bookings b where b.id <> v_new.id and b.family_party_id = v_party
      and b.is_priority and b.status in ('angefragt', 'bestaetigt', 'klaerung')
      and extract(year from b.start_date)::integer = v_year;
    select v_used + coalesce(sum(f.forfeited_days), 0) into v_used
      from public.priority_day_forfeitures f where f.family_party_id = v_party and f.year = v_year;
    if v_used + v_requested > 42 then
      raise exception 'Diese Buchung überschreitet deine verfügbare P-Zeit. Deine Partei hat in diesem Jahr noch % P-Tage übrig.', greatest(42 - v_used, 0);
    end if;
$old$;
  new_block text := $new$
    v_party := v_new.family_party_id;
    for v_year in select generate_series(extract(year from v_new.start_date)::integer, extract(year from v_new.end_date)::integer) loop
      v_requested := least(v_new.end_date, make_date(v_year,12,31)) - greatest(v_new.start_date, make_date(v_year,1,1)) + 1;
      select coalesce(sum(least(b.end_date, make_date(v_year,12,31)) - greatest(b.start_date, make_date(v_year,1,1)) + 1), 0) into v_used
        from public.bookings b where b.id <> v_new.id and b.family_party_id = v_party
        and b.is_priority and b.status in ('angefragt', 'bestaetigt', 'klaerung')
        and b.start_date <= make_date(v_year,12,31) and b.end_date >= make_date(v_year,1,1);
      select v_used + coalesce(sum(f.forfeited_days), 0) into v_used
        from public.priority_day_forfeitures f where f.family_party_id = v_party and f.year = v_year;
      if v_used + v_requested > 42 then
        raise exception 'Diese Buchung überschreitet deine verfügbare P-Zeit. Deine Partei hat im Jahr % noch % P-Tage übrig.', v_year, greatest(42 - v_used, 0);
      end if;
    end loop;
$new$;
begin
  if position(old_block in definition) = 0 then raise exception 'Unerwartete save_booking-Version. Migration abgebrochen.'; end if;
  execute replace(definition, old_block, new_block);
end $migration$;

notify pgrst, 'reload schema';
commit;
