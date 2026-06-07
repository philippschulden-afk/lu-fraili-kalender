insert into public.family_parties (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Peter'),
  ('00000000-0000-0000-0000-000000000002', 'Christoph'),
  ('00000000-0000-0000-0000-000000000003', 'Partei 3'),
  ('00000000-0000-0000-0000-000000000004', 'Partei 4'),
  ('00000000-0000-0000-0000-000000000005', 'Partei 5')
on conflict (id) do update set name = excluded.name;

insert into public.profiles (user_id, full_name, email, family_party_id, role) values
  ('10000000-0000-0000-0000-000000000001', 'Peter', 'peter@example.com', '00000000-0000-0000-0000-000000000001', 'schlichter'),
  ('10000000-0000-0000-0000-000000000002', 'Carmen', 'carmen@example.com', '00000000-0000-0000-0000-000000000001', 'schlichter'),
  ('10000000-0000-0000-0000-000000000003', 'Christoph', 'christoph@example.com', '00000000-0000-0000-0000-000000000002', 'user'),
  ('10000000-0000-0000-0000-000000000004', 'Beispiel Nutzerin', 'partei3@example.com', '00000000-0000-0000-0000-000000000003', 'user'),
  ('10000000-0000-0000-0000-000000000005', 'Beispiel Nutzer', 'partei4@example.com', '00000000-0000-0000-0000-000000000004', 'user')
on conflict (email) do update set
  full_name = excluded.full_name,
  family_party_id = excluded.family_party_id,
  role = excluded.role;

insert into public.bookings (id, family_party_id, created_by, start_date, end_date, is_priority, shared_stay_allowed, status, comment, notice_period_ends_at, confirmed_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-03', '2026-08-17', true, false, 'bestaetigt', 'Sommerurlaub Peter', now() - interval '10 days', now() - interval '7 days'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '2026-09-10', '2026-09-20', false, false, 'angefragt', 'Herbstaufenthalt', now() + interval '3 days', null),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '2026-07-01', '2026-07-08', true, false, 'klaerung', 'Bitte gemeinsam klären', now() + interval '1 day', null),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', '2026-06-20', '2026-06-25', false, true, 'bestaetigt', 'Normaler Aufenthalt, gemeinsamer Aufenthalt ist möglich', now() - interval '10 days', now() - interval '7 days')
on conflict (id) do nothing;

insert into public.objections (booking_id, created_by, reason) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Wir wollten in diesem Zeitraum auch fahren.')
on conflict do nothing;

insert into public.booking_events (booking_id, event_type, message, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'seed', 'Beispielbuchung bestätigt.', null),
  ('20000000-0000-0000-0000-000000000002', 'seed', 'Beispielanfrage erstellt.', null),
  ('20000000-0000-0000-0000-000000000003', 'seed', 'Beispiel mit Klärung erstellt.', null),
  ('20000000-0000-0000-0000-000000000004', 'seed', 'Normale Beispielbuchung erstellt.', null);
