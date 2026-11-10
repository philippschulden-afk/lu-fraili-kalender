begin;

alter table public.bookings
  add column notice_start_date date,
  add column notice_end_date date;
update public.bookings set notice_start_date = start_date, notice_end_date = end_date;

-- Fail rather than silently patch an unexpected version of the atomic writer.
create function pg_temp.replace_booking_fragment(source text, old_fragment text, new_fragment text)
returns text language plpgsql as $$
begin
  if (length(source) - length(replace(source, old_fragment, ''))) / length(old_fragment) <> 1 then
    raise exception 'Unerwartete Buchungsfunktion. Migration abgebrochen: %', left(old_fragment, 100);
  end if;
  return replace(source, old_fragment, new_fragment);
end;
$$;

do $migration$
declare
  definition text := pg_get_functiondef('public.save_booking(uuid,uuid,jsonb,boolean,boolean,timestamptz)'::regprocedure);
begin
  definition := pg_temp.replace_booking_fragment(definition,
    '  v_party_json jsonb;',
    '  v_party_json jsonb;
  v_priority_conflict boolean;
  v_normal_conflict boolean;
  v_needs_clarification boolean := false;
  v_today date := (now() at time zone ''Europe/Berlin'')::date;');

  definition := pg_temp.replace_booking_fragment(definition,
    '    v_new.priority_protected_dates := ''{}'';',
    '    v_new.priority_protected_dates := ''{}'';
    v_new.notice_start_date := v_new.start_date;
    v_new.notice_end_date := v_new.end_date;');

  definition := pg_temp.replace_booking_fragment(definition,
    $old$        or v_old.notice_period_ends_at > now()
        or exists (select 1 from public.objections where booking_id = v_old.id) then$old$,
    $new$        or v_old.notice_period_ends_at > now() then$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$      v_new.status := 'bestaetigt';
    elsif not p_management then$old$,
    $new$      if exists (select 1 from public.objections where booking_id = v_old.id) then
        v_new.status := 'klaerung';
        v_needs_clarification := true;
      else
        v_new.status := 'bestaetigt';
      end if;
    elsif not p_management then$new$);

  definition := pg_temp.replace_booking_fragment(definition,
    $old$elsif v_actor.role <> 'schlichter' or v_old.status <> 'angefragt'
          or v_new.status not in ('bestaetigt', 'abgelehnt')
          or not exists (select 1 from public.objections where booking_id = v_old.id) then$old$,
    $new$elsif v_actor.role <> 'schlichter' or v_old.status not in ('angefragt', 'klaerung')
          or v_new.status not in ('bestaetigt', 'abgelehnt')
          or (v_old.status <> 'klaerung' and not exists (select 1 from public.objections where booking_id = v_old.id)) then$new$);

  -- Only the delta calculation uses the last announced range, not each incremental edit.
  definition := pg_temp.replace_booking_fragment(definition,
    $old$    select count(*) into v_delta from (
      (select unnest(public.booking_date_array(v_old.start_date, v_old.end_date))
       except select unnest(public.booking_date_array(v_new.start_date, v_new.end_date)))
      union all
      (select unnest(public.booking_date_array(v_new.start_date, v_new.end_date))
       except select unnest(public.booking_date_array(v_old.start_date, v_old.end_date)))
    ) changed_days;$old$,
    $new$    select count(*) into v_delta from (
      (select unnest(public.booking_date_array(coalesce(v_old.notice_start_date, v_old.start_date), coalesce(v_old.notice_end_date, v_old.end_date)))
       except select unnest(public.booking_date_array(v_new.start_date, v_new.end_date)))
      union all
      (select unnest(public.booking_date_array(v_new.start_date, v_new.end_date))
       except select unnest(public.booking_date_array(coalesce(v_old.notice_start_date, v_old.start_date), coalesce(v_old.notice_end_date, v_old.end_date))))
    ) changed_days;$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$      v_new.confirmed_at := null;$old$,
    $new$      v_new.confirmed_at := null;
      v_new.notice_start_date := v_new.start_date;
      v_new.notice_end_date := v_new.end_date;$new$);

  definition := pg_temp.replace_booking_fragment(definition,
    $old$  if v_new.status in ('angefragt', 'bestaetigt', 'klaerung') and exists (
    select 1 from public.bookings b
    where b.id <> v_new.id and b.status = 'bestaetigt' and b.is_priority
      and b.start_date <= v_new.end_date and b.end_date >= v_new.start_date
  ) then raise exception 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.'; end if;$old$,
    $new$  if v_new.status in ('angefragt', 'bestaetigt') and
    (v_create or v_dates_changed or v_old.status is distinct from v_new.status
      or v_old.family_party_id is distinct from v_new.family_party_id
      or v_old.is_priority is distinct from v_new.is_priority
      or v_old.shared_stay_allowed is distinct from v_new.shared_stay_allowed) then
    select exists (
      select 1 from public.bookings b where b.id <> v_new.id and b.is_priority
        and b.status in ('angefragt', 'bestaetigt', 'klaerung')
        and ((b.status = 'bestaetigt' and b.start_date <= v_new.end_date and b.end_date >= v_new.start_date)
          or exists (select 1 from unnest(b.priority_protected_dates) d where d between v_new.start_date and v_new.end_date))
    ) into v_priority_conflict;
    select exists (
      select 1 from public.bookings b where b.id <> v_new.id and not b.is_priority
        and not v_new.is_priority and b.family_party_id <> v_new.family_party_id
        and b.status in ('angefragt', 'bestaetigt', 'klaerung')
        and b.start_date <= v_new.end_date and b.end_date >= v_new.start_date
        and (not b.shared_stay_allowed or not v_new.shared_stay_allowed)
    ) into v_normal_conflict;
    if v_priority_conflict or v_normal_conflict then
      if p_auto_confirm then
        v_new.status := 'klaerung';
        v_needs_clarification := true;
      elsif v_priority_conflict then
        raise exception 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.';
      else
        raise exception 'Gemeinsamer Aufenthalt muss bei beiden Buchungen erlaubt sein. Bitte stimmt euch vorher ab.';
      end if;
    end if;
  end if;$new$);

  definition := pg_temp.replace_booking_fragment(definition,
    $old$elsif v_new.status <> 'abgelehnt' and current_date > (v_cutoff_start - interval '1 month')::date
        and current_date <= v_cutoff_start then$old$,
    $new$elsif v_new.status <> 'abgelehnt' and v_today > (v_cutoff_start - interval '1 month')::date then$new$);

  definition := pg_temp.replace_booking_fragment(definition,
    $old$      v_new.priority_protection_start_date := v_new.start_date;$old$,
    $new$      v_new.priority_protection_start_date := coalesce(v_new.priority_protection_start_date, v_new.start_date);$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$    v_new.confirmed_at := coalesce(v_new.confirmed_at, now());$old$,
    $new$    v_new.confirmed_at := coalesce(v_new.confirmed_at, now());
    if v_old.status is distinct from 'bestaetigt' then
      v_new.notice_start_date := v_new.start_date;
      v_new.notice_end_date := v_new.end_date;
    end if;$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$      priority_protection_start_date = v_new.priority_protection_start_date$old$,
    $new$      priority_protection_start_date = v_new.priority_protection_start_date,
      notice_start_date = v_new.notice_start_date, notice_end_date = v_new.notice_end_date$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$when p_auto_confirm then 'auto_confirmed'$old$,
    $new$when v_needs_clarification then 'auto_clarification' when p_auto_confirm then 'auto_confirmed'$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$        when p_auto_confirm then 'Buchung wurde automatisch bestätigt.'$old$,
    $new$        when v_needs_clarification then 'Automatische Bestätigung gestoppt. Widerspruch oder Überschneidung: Klärung erforderlich.'
        when p_auto_confirm then 'Buchung wurde automatisch bestätigt.'$new$);
  execute definition;
end;
$migration$;

do $migration$
declare definition text := pg_get_functiondef('public.add_booking_objection(uuid,uuid,text)'::regprocedure);
begin
  definition := pg_temp.replace_booking_fragment(definition,
    $old$v_booking.status <> 'angefragt'$old$,
    $new$v_booking.status not in ('angefragt', 'klaerung')$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$  insert into public.objections (booking_id, created_by, reason)$old$,
    $new$  update public.bookings set status = 'klaerung' where id = p_booking_id;
  insert into public.objections (booking_id, created_by, reason)$new$);
  execute definition;
end;
$migration$;

-- Keep quota records even if a moderator tries to permanently delete the booking.
create function private.guard_priority_booking_delete()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(617287150011::bigint);
  if (old.is_priority and old.confirmed_at is not null)
    or cardinality(old.priority_protected_dates) > 0
    or exists (select 1 from public.priority_day_forfeitures where booking_id = old.id) then
    raise exception 'Diese Buchung kann nicht gelöscht werden, da P-Tage erhalten bleiben müssen. Bitte storniere sie stattdessen.';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_priority_booking_delete() from public, anon, authenticated;
create trigger guard_priority_booking_delete before delete on public.bookings
  for each row execute function private.guard_priority_booking_delete();

-- Existing open objections must be visible with the same status as new ones.
with changed as (
  update public.bookings b set status = 'klaerung'
  where b.status = 'angefragt' and exists (select 1 from public.objections o where o.booking_id = b.id)
  returning b.id
)
insert into public.booking_events (booking_id, event_type, message)
select id, 'clarification_required', 'Offener Widerspruch: Klärung erforderlich.' from changed;

notify pgrst, 'reload schema';
commit;
