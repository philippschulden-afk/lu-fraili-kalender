-- Isolated regression database only. No test data survives.
begin;
do $$
declare
  party uuid := gen_random_uuid();
  priority_party uuid := gen_random_uuid();
  moderator_party uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  priority_actor uuid := gen_random_uuid();
  moderator uuid := gen_random_uuid();
  normal_id uuid;
  priority_id uuid;
  quota_id uuid;
  saved jsonb;
  result jsonb;
  base date := make_date(extract(year from current_date)::integer + 5, 2, 1);
begin
  insert into public.family_parties(id, name) values
    (party, 'Normale Testpartei'), (priority_party, 'P-Testpartei'), (moderator_party, 'Schlichter-Testpartei');
  insert into public.profiles(user_id, email, family_party_id, role) values
    (actor, actor::text || '@example.invalid', party, 'user'),
    (priority_actor, priority_actor::text || '@example.invalid', priority_party, 'user'),
    (moderator, moderator::text || '@example.invalid', moderator_party, 'schlichter');

  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base, 'end_date', base + 7));
  normal_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(normal_id, moderator, '{"status":"bestaetigt"}', true);
  saved := public.save_booking(null, priority_actor, jsonb_build_object('start_date', base + 2, 'end_date', base + 9, 'is_priority', true));
  priority_id := (saved->'booking'->>'id')::uuid;
  if saved->'booking'->>'status' <> 'klaerung' then raise exception 'P-displacement must require clarification'; end if;
  if not exists (select 1 from public.bookings b where b.id = normal_id and b.status = 'klaerung'
    and b.start_date = base and b.end_date = base + 7 and b.confirmed_at is not null) then
    raise exception 'Normal booking must retain dates and prior confirmation while clarifying';
  end if;
  if not exists (select 1 from public.booking_events e where e.booking_id = normal_id and e.event_type = 'priority_displacement')
    or not exists (select 1 from public.booking_events e where e.booking_id = priority_id and e.event_type = 'priority_displacement') then
    raise exception 'Both bookings need displacement history';
  end if;
  update public.bookings set notice_period_ends_at = now() - interval '1 second' where id = priority_id;
  result := public.save_booking(priority_id, null, '{}', false, true);
  if (result->>'changed')::boolean then raise exception 'Displacement must not auto-confirm'; end if;
  result := public.save_booking(priority_id, moderator, '{"status":"bestaetigt"}');
  if result->'booking'->>'status' <> 'bestaetigt' then raise exception 'Moderator decision failed'; end if;
  if jsonb_array_length(result->'booking'->'priority_protected_dates') <> 7 then raise exception '7-night reservation must protect exactly 7 nights'; end if;
  result := public.save_booking(priority_id, priority_actor, '{"comment":"Abgestimmt."}');
  if result->'booking'->>'status' <> 'bestaetigt' then raise exception 'Comment must not restart clarification'; end if;
  begin
    perform public.save_booking(normal_id, moderator, '{"status":"bestaetigt"}');
    raise exception 'Unchanged normal booking was confirmed over P-time';
  exception when raise_exception then
    if sqlerrm <> 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.' then raise; end if;
  end;
  perform public.save_booking(normal_id, moderator, '{"status":"abgelehnt"}');

  -- Same-day departure/arrival is allowed regardless of P-time, party or sharing.
  saved := public.save_booking(null, actor, jsonb_build_object('start_date', base + 9, 'end_date', base + 16, 'is_priority', true));
  if saved->'booking'->>'status' <> 'angefragt' then raise exception 'Same-day P turnover was blocked'; end if;
  perform public.save_booking((saved->'booking'->>'id')::uuid, actor, '{"status":"storniert"}');
  perform public.save_booking(null, actor, jsonb_build_object('start_date', base + 9, 'end_date', base + 10));
  perform public.save_booking(null, priority_actor, jsonb_build_object('start_date', base - 7, 'end_date', base + 2));
  begin
    perform public.save_booking(null, actor, jsonb_build_object('start_date', base + 8, 'end_date', base + 10, 'is_priority', true));
    raise exception 'One genuinely overlapping priority night was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt.' then raise; end if;
  end;

  -- No management bypass: 21 nights per stay and 42 nights per year, including requests.
  saved := public.save_booking(null, moderator, jsonb_build_object('start_date', base + 40, 'end_date', base + 61, 'is_priority', true), true);
  quota_id := (saved->'booking'->>'id')::uuid;
  perform public.save_booking(null, moderator, jsonb_build_object('start_date', base + 70, 'end_date', base + 91, 'is_priority', true), true);
  begin
    perform public.save_booking(null, moderator, jsonb_build_object('start_date', base + 100, 'end_date', base + 101, 'is_priority', true), true);
    raise exception 'Moderator exceeded annual quota';
  exception when raise_exception then
    if sqlerrm not like 'Diese Buchung überschreitet deine verfügbare P-Zeit.%' then raise; end if;
  end;
  begin
    perform public.save_booking(quota_id, moderator, jsonb_build_object('end_date', base + 62), true);
    raise exception 'Moderator exceeded single-booking limit';
  exception when raise_exception then
    if sqlerrm <> 'Eine einzelne P-Buchung darf höchstens 21 Tage lang sein.' then raise; end if;
  end;
  begin
    perform public.save_booking(null, actor, jsonb_build_object('start_date', base + 200, 'end_date', base + 200));
    raise exception 'Zero-night booking accepted';
  exception when raise_exception then
    if sqlerrm <> 'Bitte wähle Anreise und Abreise mit mindestens einer Übernachtung.' then raise; end if;
  end;
end;
$$;
rollback;
