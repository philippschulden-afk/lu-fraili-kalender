begin;

-- Stop concurrent booking changes while the meaning of protected dates changes.
do $$ begin
  perform pg_advisory_xact_lock(617287150011::bigint);
  if exists (select 1 from public.priority_day_forfeitures) then
    raise exception 'Bestehende verfallene P-Tage müssen vor der Umstellung auf Übernachtungen geprüft werden. Es wurde nichts geändert.';
  end if;
end $$;

-- Each date now represents the night starting on that date. Checkout is excluded.
create or replace function public.booking_date_array(p_start date, p_end date)
returns date[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(p_start + n order by n), '{}'::date[])
  from generate_series(0, p_end - p_start - 1) n;
$$;

update public.bookings b set priority_protected_dates = case
  when b.status = 'bestaetigt' and b.is_priority then public.booking_date_array(b.start_date, b.end_date)
  when cardinality(b.priority_protected_dates) > 0 then
    array(select d from unnest(b.priority_protected_dates) d
      where d < (select max(last_day) from unnest(b.priority_protected_dates) last_day) order by d)
  else '{}'::date[] end,
  priority_protection_start_date = case when b.status = 'bestaetigt' and b.is_priority
    then coalesce(b.priority_protection_start_date, b.start_date)
    else b.priority_protection_start_date end;

create or replace function pg_temp.replace_booking_fragment(source text, old_fragment text, new_fragment text)
returns text language plpgsql as $$
begin
  if (length(source) - length(replace(source, old_fragment, ''))) / length(old_fragment) <> 1 then
    raise exception 'Unerwartete Buchungsfunktion. Migration abgebrochen: %', left(old_fragment, 100);
  end if;
  return replace(source, old_fragment, new_fragment);
end;
$$;

do $migration$
declare definition text := pg_get_functiondef('public.save_booking(uuid,uuid,jsonb,boolean,boolean,timestamptz)'::regprocedure);
begin
  definition := pg_temp.replace_booking_fragment(definition,
    '  v_normal_conflict boolean;',
    '  v_normal_conflict boolean;
  v_displaced_normal_ids uuid[] := ''{}'';
  v_displaced_id uuid;');
  definition := pg_temp.replace_booking_fragment(definition,
    $old$v_new.end_date < v_new.start_date then$old$,
    $new$(v_new.end_date < v_new.start_date or (v_new.end_date = v_new.start_date and (v_create or v_new.status in ('angefragt','bestaetigt','klaerung')))) then$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$Bitte wähle ein gültiges Start- und Enddatum.$old$,
    $new$Bitte wähle Anreise und Abreise mit mindestens einer Übernachtung.$new$);

  -- Only interior overlaps block; one party may check in when another checks out.
  if position('b.start_date <= v_new.end_date and b.end_date >= v_new.start_date' in definition) = 0 then
    raise exception 'Unerwartete Überschneidungsprüfung.';
  end if;
  definition := replace(definition,
    'b.start_date <= v_new.end_date and b.end_date >= v_new.start_date',
    'b.start_date < v_new.end_date and b.end_date > v_new.start_date and b.start_date < b.end_date');
  definition := pg_temp.replace_booking_fragment(definition,
    'd between v_new.start_date and v_new.end_date',
    'd >= v_new.start_date and d < v_new.end_date');
  definition := pg_temp.replace_booking_fragment(definition,
    'v_day between v_new.start_date and v_new.end_date',
    'v_day >= v_new.start_date and v_day < v_new.end_date');

  -- A new/changed P-booking involving a confirmed normal stay needs a decision.
  -- A moderator may then explicitly confirm or reject it; no automatic cancellation.
  definition := pg_temp.replace_booking_fragment(definition,
    $old$  if not v_create then
    v_protected := coalesce(v_old.priority_protected_dates, '{}');$old$,
    $new$  if v_new.is_priority and v_new.status in ('angefragt', 'bestaetigt', 'klaerung')
    and (v_create or v_dates_changed or v_old.status is distinct from v_new.status
      or v_old.family_party_id is distinct from v_new.family_party_id
      or v_old.is_priority is distinct from v_new.is_priority) then
    select coalesce(array_agg(b.id), '{}'::uuid[]) into v_displaced_normal_ids
      from public.bookings b where b.id <> v_new.id and not b.is_priority
        and b.family_party_id <> v_new.family_party_id
        and (b.status = 'bestaetigt' or (b.status = 'klaerung' and b.confirmed_at is not null))
        and b.start_date < v_new.end_date and b.end_date > v_new.start_date
        and b.start_date < b.end_date;
    if cardinality(v_displaced_normal_ids) > 0 and not (
      not p_auto_confirm and v_actor.role = 'schlichter'
      and v_old.status = 'klaerung' and v_new.status = 'bestaetigt'
      and not v_dates_changed and v_old.family_party_id = v_new.family_party_id
      and v_old.is_priority = v_new.is_priority
    ) then
      v_new.status := 'klaerung';
      v_new.confirmed_at := null;
      v_needs_clarification := p_auto_confirm;
    end if;
  end if;

  if not v_create then
    v_protected := coalesce(v_old.priority_protected_dates, '{}');$new$);

  definition := pg_temp.replace_booking_fragment(definition,
    $old$and not p_management then
    v_requested := v_new.end_date - v_new.start_date + 1;$old$,
    $new$then
    v_requested := v_new.end_date - v_new.start_date;$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$for v_year in select generate_series(extract(year from v_new.start_date)::integer, extract(year from v_new.end_date)::integer) loop$old$,
    $new$for v_year in select generate_series(extract(year from v_new.start_date)::integer, extract(year from v_new.end_date - 1)::integer) loop$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$v_requested := least(v_new.end_date, make_date(v_year,12,31)) - greatest(v_new.start_date, make_date(v_year,1,1)) + 1;$old$,
    $new$v_requested := least(v_new.end_date, make_date(v_year+1,1,1)) - greatest(v_new.start_date, make_date(v_year,1,1));$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$sum(least(b.end_date, make_date(v_year,12,31)) - greatest(b.start_date, make_date(v_year,1,1)) + 1)$old$,
    $new$sum(least(b.end_date, make_date(v_year+1,1,1)) - greatest(b.start_date, make_date(v_year,1,1)))$new$);
  definition := pg_temp.replace_booking_fragment(definition,
    $old$b.start_date <= make_date(v_year,12,31) and b.end_date >= make_date(v_year,1,1)$old$,
    $new$b.start_date < make_date(v_year+1,1,1) and b.end_date > make_date(v_year,1,1)$new$);

  definition := pg_temp.replace_booking_fragment(definition,
    $old$  if v_new_request then
    insert into public.booking_events$old$,
    $new$  if cardinality(v_displaced_normal_ids) > 0 then
    foreach v_displaced_id in array v_displaced_normal_ids loop
      update public.bookings set status = 'klaerung'
        where id = v_displaced_id and status = 'bestaetigt';
      insert into public.booking_events (booking_id, event_type, message, created_by)
        values (v_displaced_id, 'priority_displacement',
          'Überschneidung mit P-Zeit: Klärung erforderlich. Betroffene P-Buchung: ' || v_new.id::text || '. Es wurde nichts storniert oder verkürzt.', p_actor_id);
    end loop;
    insert into public.booking_events (booking_id, event_type, message, created_by)
      values (v_new.id, 'priority_displacement',
        'Diese P-Zeit betrifft eine normale Buchung. Beide Parteien müssen den Zeitraum mit den Schlichtern klären.', p_actor_id);
  end if;

  if v_new_request then
    insert into public.booking_events$new$);
  execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
