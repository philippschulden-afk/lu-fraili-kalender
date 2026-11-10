-- Run only in an isolated test database after all migrations. Everything rolls back.
begin;

create function pg_temp.expect(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'Test failed: %', message; end if;
end;
$$;

create function pg_temp.actor(label text, moderator boolean default false)
returns uuid language plpgsql as $$
declare party uuid := gen_random_uuid(); actor uuid := gen_random_uuid();
begin
  insert into public.family_parties(id, name) values (party, label);
  insert into public.profiles(user_id, email, family_party_id, role)
  values(actor, actor::text || '@example.invalid', party, (case when moderator then 'schlichter' else 'user' end)::public.user_role);
  return actor;
end;
$$;

do $$
declare
  moderator uuid := pg_temp.actor('Test Schlichter', true);
  actor uuid;
  other_actor uuid;
  third_actor uuid;
  booking_id uuid;
  other_id uuid;
  saved jsonb;
  result jsonb;
  base date := make_date(extract(year from current_date)::integer + 3, 3, 1);
  past_start date := current_date - 10;
begin
  actor := pg_temp.actor('Stornierung nach Beginn');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', past_start, 'end_date', past_start + 7, 'is_priority', true));
  booking_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(booking_id, moderator, '{"status":"bestaetigt"}', true);
  result := public.save_booking(booking_id, actor, '{"status":"storniert"}');
  perform pg_temp.expect((result->>'forfeited_days')::integer = 8, 'Cancellation after stay retains all 8 priority days');
  perform pg_temp.expect(result->'booking'->>'status' = 'storniert', 'Cancellation saves status');
  begin
    delete from public.bookings where id = booking_id;
    raise exception 'Protected booking was deleted';
  exception when raise_exception then
    if sqlerrm not like 'Diese Buchung kann nicht gelöscht werden, da P-Tage%' then raise; end if;
  end;
  perform pg_temp.expect((select count(*) from public.priority_day_forfeitures f where f.booking_id = (saved->'booking'->>'id')::uuid) = 8, 'Deletion preserves exactly 8 forfeiture rows');

  actor := pg_temp.actor('Stornierung rechtzeitig');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base, 'end_date', base + 7, 'is_priority', true));
  booking_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(booking_id, moderator, '{"status":"bestaetigt"}', true);
  result := public.save_booking(booking_id, actor, '{"status":"storniert"}');
  perform pg_temp.expect((result->>'forfeited_days')::integer = 0, 'Early cancellation returns days');

  actor := pg_temp.actor('Wiederholte kleine Änderungen');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base + 30, 'end_date', base + 37));
  booking_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(booking_id, moderator, '{"status":"bestaetigt"}', true);
  result := public.save_booking(booking_id, actor, jsonb_build_object('start_date', base + 31, 'end_date', base + 38));
  perform pg_temp.expect(result->'booking'->>'status' = 'bestaetigt', 'First 1-day shift remains confirmed');
  result := public.save_booking(booking_id, actor, jsonb_build_object('start_date', base + 32, 'end_date', base + 39));
  perform pg_temp.expect((result->>'new_request')::boolean and result->'booking'->>'status' = 'angefragt', 'Second 1-day shift restarts notice cumulatively');
  perform pg_temp.expect((result->'booking'->>'notice_start_date')::date = base + 32, 'Notice baseline advances only with new request');

  actor := pg_temp.actor('Geschützte P-Zeit');
  other_actor := pg_temp.actor('Andere Partei');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base + 60, 'end_date', base + 67, 'is_priority', true));
  booking_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(booking_id, moderator, '{"status":"bestaetigt"}', true);
  result := public.save_booking(booking_id, actor, jsonb_build_object('end_date', base + 71));
  perform pg_temp.expect(result->'booking'->>'status' = 'angefragt', 'Extension is requested again');
  begin
    perform public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 61, 'end_date', base + 62));
    raise exception 'Original confirmed dates lost protection';
  exception when raise_exception then
    if sqlerrm <> 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.' then raise; end if;
  end;
  -- Newly added dates are not confirmed/protected yet.
  perform public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 70, 'end_date', base + 71, 'is_priority', true));

  actor := pg_temp.actor('Erste P-Anfrage');
  other_actor := pg_temp.actor('Zweite P-Anfrage');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base + 100, 'end_date', base + 107, 'is_priority', true));
  booking_id := (saved->'booking'->>'id')::uuid;
  saved := public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 101, 'end_date', base + 108, 'is_priority', true));
  other_id := (saved->'booking'->>'id')::uuid;
  update public.bookings set notice_period_ends_at = now() - interval '1 second' where id in (booking_id, other_id);
  result := public.save_booking(booking_id, null, '{}', false, true);
  perform pg_temp.expect(result->'booking'->>'status' = 'bestaetigt', 'First priority request confirms');
  result := public.save_booking(other_id, null, '{}', false, true);
  perform pg_temp.expect(result->'booking'->>'status' = 'klaerung', 'Competing request enters clarification');
  result := public.save_booking(other_id, null, '{}', false, true);
  perform pg_temp.expect(not (result->>'changed')::boolean, 'Cron does not retry clarification');
  perform pg_temp.expect((select count(*) from public.booking_events e where e.booking_id = other_id and e.event_type = 'auto_clarification') = 1, 'Exactly one clarification event');
  perform pg_temp.expect((select count(*) from public.booking_events e where e.booking_id = other_id and e.event_type = 'auto_confirmed') = 0, 'No false confirmation history');
  result := public.save_booking(other_id, moderator, '{"status":"abgelehnt"}');
  perform pg_temp.expect(result->'booking'->>'status' = 'abgelehnt', 'Moderator can reject automatic clarification');

  actor := pg_temp.actor('Anfrage mit Widerspruch');
  other_actor := pg_temp.actor('Widersprechende Partei');
  third_actor := pg_temp.actor('Weiterer Widerspruch');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base + 140, 'end_date', base + 147));
  booking_id := (saved->'booking'->>'id')::uuid;
  perform public.add_booking_objection(booking_id, other_actor, 'Bitte abstimmen.');
  perform pg_temp.expect((select status = 'klaerung' from public.bookings where id = booking_id), 'Objection updates visible status');
  perform public.add_booking_objection(booking_id, third_actor, 'Wir möchten auch fahren.');
  result := public.save_booking(booking_id, moderator, '{"status":"bestaetigt"}');
  perform pg_temp.expect(result->'booking'->>'status' = 'bestaetigt', 'Moderator can decide objections');
  result := public.save_booking(booking_id, null, '{}', false, true);
  perform pg_temp.expect(not (result->>'changed')::boolean, 'Decision is final');

  actor := pg_temp.actor('Normale Buchung');
  other_actor := pg_temp.actor('Gemeinsamer Aufenthalt');
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base + 180, 'end_date', base + 187));
  booking_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(booking_id, moderator, '{"status":"bestaetigt"}', true);
  begin
    perform public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 181, 'end_date', base + 182, 'shared_stay_allowed', true));
    raise exception 'Unilateral shared-stay permission was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Gemeinsamer Aufenthalt muss bei beiden Buchungen%' then raise; end if;
  end;
  perform public.save_booking(booking_id, actor, '{"shared_stay_allowed":true}');
  begin
    perform public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 181, 'end_date', base + 182));
    raise exception 'Missing new shared-stay permission was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Gemeinsamer Aufenthalt muss bei beiden Buchungen%' then raise; end if;
  end;
  perform public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 181, 'end_date', base + 182, 'shared_stay_allowed', true));
  -- Priority displacement remains allowed even without shared-stay permissions.
  perform public.save_booking(null, other_actor, jsonb_build_object('start_date', base + 181, 'end_date', base + 182, 'is_priority', true));
end;
$$;

rollback;
