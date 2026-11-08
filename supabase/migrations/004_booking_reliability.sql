begin;

-- These dates retain the confirmed reservation while an edited booking is requested again.
alter table public.bookings
  add column if not exists priority_protected_dates date[] not null default '{}',
  add column if not exists priority_protection_start_date date;

alter table public.priority_day_forfeitures
  add column if not exists forfeited_date date;
alter table public.priority_day_forfeitures
  drop constraint if exists priority_day_forfeitures_unique_reason;
create unique index if not exists priority_day_forfeitures_booking_date_idx
  on public.priority_day_forfeitures (booking_id, forfeited_date)
  where forfeited_date is not null;

create or replace function public.guard_booking_status_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  raise exception 'Buchungen bitte über die App ändern.';
end;
$$;

-- All writes go through the checked server routes. RLS remains enabled for reads.
revoke insert, update, delete on public.bookings from anon, authenticated;
revoke insert, update, delete on public.objections from anon, authenticated;
revoke insert, update, delete on public.priority_day_forfeitures from anon, authenticated;

create or replace function public.booking_date_array(p_start date, p_end date)
returns date[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(p_start + n order by n), '{}'::date[])
  from generate_series(0, p_end - p_start) n;
$$;

create or replace function public.save_booking(
  p_booking_id uuid,
  p_actor_id uuid,
  p_changes jsonb,
  p_management boolean default false,
  p_auto_confirm boolean default false,
  p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_actor public.profiles%rowtype;
  v_create boolean := p_booking_id is null;
  v_new_request boolean := false;
  v_changed boolean;
  v_dates_changed boolean;
  v_delta integer;
  v_protected date[] := '{}';
  v_kept date[] := '{}';
  v_cutoff_start date;
  v_day date;
  v_inserted integer;
  v_forfeited integer := 0;
  v_year integer;
  v_party uuid;
  v_used integer;
  v_requested integer;
  v_reason text;
  v_party_json jsonb;
begin
  -- One short transaction serializes quota, overlap, objection and status checks.
  perform pg_advisory_xact_lock(617287150011::bigint);
  if jsonb_typeof(p_changes) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k not in ('family_party_id', 'start_date', 'end_date', 'is_priority', 'shared_stay_allowed', 'status', 'comment')
  ) then raise exception 'Ungültige Buchungsänderung.'; end if;

  if not p_auto_confirm then
    select * into v_actor from public.profiles where user_id = p_actor_id;
    if not found then raise exception 'Bitte zuerst anmelden.'; end if;
    if p_management and v_actor.role <> 'schlichter' then
      raise exception 'Nur Schlichter dürfen diese Änderung vornehmen.';
    end if;
  elsif p_actor_id is not null or v_create or p_management then
    raise exception 'Ungültige automatische Bestätigung.';
  end if;

  if v_create then
    if v_actor.family_party_id is null then raise exception 'Dein Konto ist noch keiner Familienpartei zugeordnet.'; end if;
    v_new := jsonb_populate_record(null::public.bookings, p_changes);
    v_new.id := gen_random_uuid();
    v_new.family_party_id := v_actor.family_party_id;
    v_new.created_by := p_actor_id;
    v_new.status := 'angefragt';
    v_new.is_priority := coalesce(v_new.is_priority, false);
    v_new.shared_stay_allowed := coalesce(v_new.shared_stay_allowed, false);
    v_new.created_at := now();
    v_new.updated_at := now();
    v_new.notice_period_ends_at := now() + interval '3 days';
    v_new.priority_protected_dates := '{}';
  else
    select * into v_old from public.bookings where id = p_booking_id for update;
    if not found then raise exception 'Die Buchung wurde nicht gefunden.'; end if;
    if p_expected_updated_at is not null and v_old.updated_at <> p_expected_updated_at then
      raise exception 'Die Buchung wurde inzwischen geändert. Bitte lade die Seite erneut.';
    end if;
    v_new := jsonb_populate_record(v_old, p_changes);

    if p_auto_confirm then
      if v_old.status <> 'angefragt' or v_old.notice_period_ends_at is null
        or v_old.notice_period_ends_at > now()
        or exists (select 1 from public.objections where booking_id = v_old.id) then
        return jsonb_build_object('changed', false, 'forfeited_days', 0, 'new_request', false, 'booking', to_jsonb(v_old));
      end if;
      v_new.status := 'bestaetigt';
    elsif not p_management then
      if v_old.status in ('storniert', 'abgelehnt') then raise exception 'Diese Buchung kann nicht mehr bearbeitet werden.'; end if;
      if v_actor.role <> 'schlichter' and v_old.created_by <> p_actor_id
        and v_old.family_party_id is distinct from v_actor.family_party_id then
        raise exception 'Du kannst diese Buchung nicht bearbeiten.';
      end if;
      if v_new.family_party_id <> v_old.family_party_id or v_new.is_priority <> v_old.is_priority then
        raise exception 'Nur Schlichter dürfen die Familienpartei oder P-Zeit ändern.';
      end if;
      if v_new.status <> v_old.status then
        if v_new.status = 'storniert' then
          if v_old.created_by <> p_actor_id and v_actor.role <> 'schlichter' then
            raise exception 'Du kannst nur deine eigenen Buchungen stornieren.';
          end if;
        elsif v_actor.role <> 'schlichter' or v_old.status <> 'angefragt'
          or v_new.status not in ('bestaetigt', 'abgelehnt')
          or not exists (select 1 from public.objections where booking_id = v_old.id) then
          raise exception 'Diese Buchung kann hier nicht bestätigt oder abgelehnt werden.';
        end if;
      end if;
    end if;
  end if;

  if v_new.start_date is null or v_new.end_date is null or v_new.end_date < v_new.start_date then
    raise exception 'Bitte wähle ein gültiges Start- und Enddatum.';
  end if;

  v_dates_changed := not v_create and (v_new.start_date <> v_old.start_date or v_new.end_date <> v_old.end_date);
  if v_dates_changed and v_new.status in ('angefragt', 'bestaetigt', 'klaerung') then
    select count(*) into v_delta from (
      (select unnest(public.booking_date_array(v_old.start_date, v_old.end_date))
       except select unnest(public.booking_date_array(v_new.start_date, v_new.end_date)))
      union all
      (select unnest(public.booking_date_array(v_new.start_date, v_new.end_date))
       except select unnest(public.booking_date_array(v_old.start_date, v_old.end_date)))
    ) changed_days;
    if v_delta > 3 then
      v_new_request := true;
      v_new.status := 'angefragt';
      v_new.notice_period_ends_at := now() + interval '3 days';
      v_new.confirmed_at := null;
    end if;
  end if;

  v_changed := v_create or row(v_new.start_date, v_new.end_date, v_new.family_party_id,
    v_new.is_priority, v_new.shared_stay_allowed, v_new.status, v_new.comment)
    is distinct from row(v_old.start_date, v_old.end_date, v_old.family_party_id,
    v_old.is_priority, v_old.shared_stay_allowed, v_old.status, v_old.comment);
  if not v_changed then
    return jsonb_build_object('changed', false, 'forfeited_days', 0, 'new_request', false, 'booking', to_jsonb(v_old));
  end if;

  if v_new.status in ('angefragt', 'bestaetigt', 'klaerung') and exists (
    select 1 from public.bookings b
    where b.id <> v_new.id and b.status = 'bestaetigt' and b.is_priority
      and b.start_date <= v_new.end_date and b.end_date >= v_new.start_date
  ) then raise exception 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.'; end if;

  if not v_create then
    v_protected := coalesce(v_old.priority_protected_dates, '{}');
    v_cutoff_start := v_old.priority_protection_start_date;
    if cardinality(v_protected) = 0 and v_old.is_priority and v_old.status = 'bestaetigt' then
      v_protected := public.booking_date_array(v_old.start_date, v_old.end_date);
      v_cutoff_start := v_old.start_date;
    end if;
    v_reason := case when v_new.status = 'storniert'
      then 'P-Zeit weniger als einen Monat vor Beginn storniert'
      else 'P-Zeit weniger als einen Monat vor Beginn geändert' end;
    foreach v_day in array v_protected loop
      if v_new.is_priority and v_new.status in ('angefragt', 'bestaetigt', 'klaerung')
        and v_new.family_party_id = v_old.family_party_id
        and v_day between v_new.start_date and v_new.end_date then
        v_kept := array_append(v_kept, v_day);
      elsif v_new.status <> 'abgelehnt' and current_date > (v_cutoff_start - interval '1 month')::date
        and current_date <= v_cutoff_start then
        insert into public.priority_day_forfeitures
          (family_party_id, booking_id, year, forfeited_days, forfeited_date, reason, created_by)
        values (v_old.family_party_id, v_old.id, extract(year from v_day)::integer, 1, v_day, v_reason, p_actor_id)
        on conflict (booking_id, forfeited_date) where forfeited_date is not null do nothing;
        get diagnostics v_inserted = row_count;
        v_forfeited := v_forfeited + v_inserted;
      end if;
    end loop;
    v_new.priority_protected_dates := v_kept;
    v_new.priority_protection_start_date := case when cardinality(v_kept) > 0 then v_cutoff_start else null end;
  end if;

  if v_new.is_priority and v_new.status in ('angefragt', 'bestaetigt', 'klaerung') and not p_management then
    v_requested := v_new.end_date - v_new.start_date + 1;
    if v_requested > 21 then raise exception 'Eine einzelne P-Buchung darf höchstens 21 Tage lang sein.'; end if;
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
  end if;

  if v_new.status = 'bestaetigt' then
    v_new.confirmed_at := coalesce(v_new.confirmed_at, now());
    if v_new.is_priority then
      v_new.priority_protected_dates := public.booking_date_array(v_new.start_date, v_new.end_date);
      v_new.priority_protection_start_date := v_new.start_date;
    end if;
  end if;
  if v_new.status = 'storniert' then v_new.cancelled_at := coalesce(v_new.cancelled_at, now()); end if;

  if v_create then
    insert into public.bookings select v_new.* returning * into v_new;
  else
    update public.bookings set start_date = v_new.start_date, end_date = v_new.end_date,
      family_party_id = v_new.family_party_id, is_priority = v_new.is_priority,
      shared_stay_allowed = v_new.shared_stay_allowed, status = v_new.status, comment = v_new.comment,
      notice_period_ends_at = v_new.notice_period_ends_at, confirmed_at = v_new.confirmed_at,
      cancelled_at = v_new.cancelled_at, priority_protected_dates = v_new.priority_protected_dates,
      priority_protection_start_date = v_new.priority_protection_start_date
      where id = v_new.id returning * into v_new;
  end if;

  if v_new_request then
    insert into public.booking_events (booking_id, event_type, message, created_by)
      select v_new.id, 'previous_objections', 'Widerspruch zum vorherigen Zeitraum: ' || reason, created_by
      from public.objections where booking_id = v_new.id;
    delete from public.objections where booking_id = v_new.id;
  end if;
  insert into public.booking_events (booking_id, event_type, message, created_by)
    values (v_new.id, case when v_create then 'created' when p_auto_confirm then 'auto_confirmed'
      when v_new_request then 'booking_changed_new_request' else 'booking_changed' end,
      case when v_create then 'Buchungsanfrage wurde erstellt.'
        when p_auto_confirm then 'Buchung wurde automatisch bestätigt.'
        when v_new_request then 'Buchung wurde geändert und als neue Anfrage gesendet.'
        else 'Buchung wurde geändert. Status: ' || v_new.status::text end, p_actor_id);
  if v_forfeited > 0 then
    insert into public.booking_events (booking_id, event_type, message, created_by)
      values (v_new.id, 'priority_days_forfeited', v_forfeited || ' P-Tage verfallen: ' || v_reason || '.', p_actor_id);
  end if;
  select to_jsonb(p) into v_party_json from public.family_parties p where p.id = v_new.family_party_id;
  return jsonb_build_object('changed', true, 'new_request', v_create or v_new_request,
    'forfeited_days', v_forfeited, 'booking', to_jsonb(v_new) || jsonb_build_object('family_parties', v_party_json));
end;
$$;

create or replace function public.add_booking_objection(p_booking_id uuid, p_actor_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_booking public.bookings%rowtype;
  v_actor public.profiles%rowtype;
begin
  perform pg_advisory_xact_lock(617287150011::bigint);
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Die Buchung wurde nicht gefunden.'; end if;
  select * into v_actor from public.profiles where user_id = p_actor_id;
  if not found then raise exception 'Bitte zuerst anmelden.'; end if;
  if v_actor.family_party_id is null then raise exception 'Bitte zuerst einer Familienpartei zuordnen lassen.'; end if;
  if v_actor.family_party_id = v_booking.family_party_id then raise exception 'Du kannst deiner eigenen Buchung nicht widersprechen.'; end if;
  if v_booking.status <> 'angefragt' or v_booking.notice_period_ends_at is null
    or now() >= v_booking.notice_period_ends_at then raise exception 'Die Widerspruchsfrist ist abgelaufen.'; end if;
  if length(trim(p_reason)) < 3 then raise exception 'Bitte gib einen kurzen Grund ein.'; end if;
  insert into public.objections (booking_id, created_by, reason) values (p_booking_id, p_actor_id, trim(p_reason));
  insert into public.booking_events (booking_id, event_type, message, created_by)
    values (p_booking_id, 'objected', 'Widerspruch angelegt. Grund: ' || trim(p_reason), p_actor_id);
end;
$$;

revoke all on function public.save_booking(uuid, uuid, jsonb, boolean, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.save_booking(uuid, uuid, jsonb, boolean, boolean, timestamptz) to service_role;
revoke all on function public.add_booking_objection(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.add_booking_objection(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
