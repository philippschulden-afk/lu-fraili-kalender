-- Run after migrations in a test database. All test data is rolled back.
begin;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  party uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  other_party uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  moderator uuid := gen_random_uuid();
  saved jsonb;
  test_booking_id uuid;
  quota_id uuid;
  protected_id uuid;
  reserve_day date;
  result jsonb;
  start_day date := current_date + 6;
  quota_start date := make_date(extract(year from current_date)::integer + 1, 3, 1);
  used integer;
begin
  insert into public.family_parties (id, name) values (party, 'Test Partei'), (other_party, 'Andere Test Partei');
  insert into public.profiles (user_id, email, family_party_id, role) values
    (actor, actor::text || '@example.invalid', party, 'user'),
    (other_actor, other_actor::text || '@example.invalid', other_party, 'user'),
    (moderator, moderator::text || '@example.invalid', other_party, 'schlichter');

  saved := public.save_booking(null, actor, jsonb_build_object('start_date', start_day, 'end_date', start_day + 7, 'is_priority', true));
  test_booking_id := (saved->'booking'->>'id')::uuid;
  if saved->'booking'->>'status' <> 'angefragt' then raise exception 'Expected requested booking'; end if;
  result := public.save_booking(test_booking_id, null, '{}', false, true);
  if (result->>'changed')::boolean then raise exception 'Confirmed before notice expired'; end if;
  perform public.save_booking(test_booking_id, moderator, '{"status":"bestaetigt"}', true);

  -- Any confirmed priority booking blocks overlapping bookings, even its owner.
  begin
    perform public.save_booking(null, actor, jsonb_build_object('start_date', start_day, 'end_date', start_day + 1,
      'is_priority', false, 'shared_stay_allowed', true));
    raise exception 'Expected priority overlap rejection';
  exception when raise_exception then
    if sqlerrm <> 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.' then raise; end if;
  end;

  result := public.save_booking(test_booking_id, actor, jsonb_build_object('end_date', start_day + 4));
  if (result->>'forfeited_days')::integer <> 3 then raise exception 'Shortening must forfeit 3 days'; end if;
  result := public.save_booking(test_booking_id, actor, jsonb_build_object('end_date', start_day + 4));
  if (result->>'changed')::boolean then raise exception 'No-op must not change or notify'; end if;
  result := public.save_booking(test_booking_id, actor, jsonb_build_object('end_date', start_day + 2));
  if (result->>'forfeited_days')::integer <> 2 then raise exception 'Second edit must forfeit additional days'; end if;
  result := public.save_booking(test_booking_id, actor, '{"status":"storniert"}');
  select sum(f.forfeited_days) into used from public.priority_day_forfeitures f where f.booking_id = test_booking_id;
  if used <> 8 then raise exception 'Cancellation must preserve exactly 8 forfeited days'; end if;

  -- The days forfeited by this edit must already be included in quota validation.
  saved := public.save_booking(null, other_actor, jsonb_build_object('start_date', start_day, 'end_date', start_day + 7, 'is_priority', true));
  protected_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(protected_id, moderator, '{"status":"bestaetigt"}', true);
  reserve_day := make_date(extract(year from start_day)::integer, 1, 1);
  if reserve_day <= start_day + 7 and reserve_day + 16 >= start_day then
    reserve_day := make_date(extract(year from start_day)::integer, 7, 1);
  end if;
  perform public.save_booking(null, other_actor, jsonb_build_object('start_date', reserve_day, 'end_date', reserve_day + 16, 'is_priority', true));
  perform public.save_booking(null, other_actor, jsonb_build_object('start_date', reserve_day, 'end_date', reserve_day + 16, 'is_priority', true));
  begin
    perform public.save_booking(protected_id, other_actor, jsonb_build_object('start_date', start_day + 1, 'end_date', start_day + 8));
    raise exception 'Expected quota rejection including newly forfeited day';
  exception when raise_exception then
    if sqlerrm not like 'Diese Buchung überschreitet deine verfügbare P-Zeit.%' then raise; end if;
  end;
  if exists (select 1 from public.priority_day_forfeitures f where f.booking_id = protected_id) then
    raise exception 'Failed edit partially saved forfeitures';
  end if;
  if not exists (select 1 from public.bookings b where b.id = protected_id and b.start_date = start_day) then
    raise exception 'Failed edit partially changed booking';
  end if;
  perform public.save_booking(protected_id, moderator, '{"status":"storniert"}', true);
  update public.bookings set status = 'abgelehnt' where family_party_id = other_party and status = 'angefragt';

  -- A newly requested edit must retain protection of the original confirmed days.
  saved := public.save_booking(null, other_actor, jsonb_build_object('start_date', start_day, 'end_date', start_day + 7, 'is_priority', true));
  protected_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(protected_id, moderator, '{"status":"bestaetigt"}', true);
  result := public.save_booking(protected_id, other_actor, jsonb_build_object('end_date', start_day + 11));
  if (result->>'forfeited_days')::integer <> 0 or result->'booking'->>'status' <> 'angefragt' then
    raise exception 'Extension must restart notice without forfeiture';
  end if;
  result := public.save_booking(protected_id, other_actor, '{"status":"storniert"}');
  if (result->>'forfeited_days')::integer <> 8 then raise exception 'Re-requested edit lost protection of original confirmed days'; end if;

  -- Pending bookings reserve the quota. Rejected writes leave no partial state.
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', quota_start, 'end_date', quota_start + 20, 'is_priority', true));
  quota_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(null, actor, jsonb_build_object('start_date', quota_start + 30, 'end_date', quota_start + 50, 'is_priority', true));
  begin
    perform public.save_booking(null, actor, jsonb_build_object('start_date', quota_start + 60, 'end_date', quota_start + 60, 'is_priority', true));
    raise exception 'Expected pending quota rejection';
  exception when raise_exception then
    if sqlerrm not like 'Diese Buchung überschreitet deine verfügbare P-Zeit.%' then raise; end if;
  end;

  -- A larger edit is announced again and old objections remain in the history.
  perform public.add_booking_objection(quota_id, other_actor, 'Bitte abstimmen.');
  perform public.save_booking(quota_id, moderator, '{"status":"bestaetigt"}');
  result := public.save_booking(quota_id, actor, jsonb_build_object('start_date', quota_start + 4));
  if result->'booking'->>'status' <> 'angefragt' or not (result->>'new_request')::boolean then
    raise exception 'Large edit must restart notice';
  end if;
  if exists (select 1 from public.objections o where o.booking_id = quota_id) then raise exception 'Old objection not cleared'; end if;
  if not exists (select 1 from public.booking_events e where e.booking_id = quota_id and event_type = 'previous_objections') then
    raise exception 'Old objection history lost';
  end if;

  -- An objection cannot race past confirmation or be entered after the deadline.
  perform public.add_booking_objection(quota_id, other_actor, 'Noch offen.');
  update public.bookings set notice_period_ends_at = now() - interval '1 second' where id = quota_id;
  result := public.save_booking(quota_id, null, '{}', false, true);
  if (result->>'changed')::boolean then raise exception 'Confirmed despite objection'; end if;
  begin
    perform public.add_booking_objection(quota_id, other_actor, 'Zu spät.');
    raise exception 'Expected expired objection rejection';
  exception when raise_exception then
    if sqlerrm <> 'Die Widerspruchsfrist ist abgelaufen.' then raise; end if;
  end;
  if has_function_privilege('authenticated', 'public.save_booking(uuid,uuid,jsonb,boolean,boolean,timestamptz)', 'execute') then
    raise exception 'Normal users may not execute the server mutation directly';
  end if;
  -- Cron can confirm without an Auth user, but only once and without objections.
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', quota_start + 80, 'end_date', quota_start + 81));
  test_booking_id := (saved->'booking'->>'id')::uuid;
  update public.bookings set notice_period_ends_at = now() - interval '1 second' where id = test_booking_id;
  result := public.save_booking(test_booking_id, null, '{}', false, true);
  if not (result->>'changed')::boolean or result->'booking'->>'status' <> 'bestaetigt' then
    raise exception 'Service role auto-confirmation failed';
  end if;
  result := public.save_booking(test_booking_id, null, '{}', false, true);
  if (result->>'changed')::boolean then raise exception 'Cron confirmed the same booking twice'; end if;
end;
$$;

rollback;
