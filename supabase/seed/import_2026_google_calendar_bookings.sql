-- One-time import of 2026 Lu Fraili bookings from the old Google Calendar.
-- The old Google Calendar DTEND values were exclusive; the dates below are already
-- converted to inclusive booking end dates. Use these exact dates.
--
-- Safe to run more than once: bookings are matched by family party, date range,
-- priority flag, status and import comment before inserting.

with required_parties(name) as (
  values
    ('Peter'),
    ('Philipp'),
    ('Franziska'),
    ('Christoph'),
    ('Teresa')
),
insert_missing_parties as (
  insert into public.family_parties (name)
  select rp.name
  from required_parties rp
  where not exists (
    select 1
    from public.family_parties fp
    where fp.name = rp.name
  )
  returning id, name
),
import_rows(family_party_name, start_date, end_date, original_title) as (
  values
    ('Peter', '2026-03-25'::date, '2026-04-06'::date, 'Peter und Birgit'),
    ('Philipp', '2026-05-01'::date, '2026-05-15'::date, 'Philipp'),
    ('Peter', '2026-06-13'::date, '2026-06-27'::date, 'Peter & Birgit'),
    ('Franziska', '2026-08-08'::date, '2026-08-23'::date, 'Franzi und Felix (eher nicht)'),
    ('Christoph', '2026-08-29'::date, '2026-09-14'::date, 'P - Christoph und Nadine Lu Fraili'),
    ('Teresa', '2026-09-15'::date, '2026-09-30'::date, 'P - Tesi & Jakob')
),
party_lookup as (
  select distinct on (fp.name)
    fp.id,
    fp.name
  from public.family_parties fp
  join required_parties rp on rp.name = fp.name
  order by fp.name, fp.created_at
),
inserted_bookings as (
  insert into public.bookings (
    family_party_id,
    created_by,
    start_date,
    end_date,
    is_priority,
    shared_stay_allowed,
    status,
    comment,
    notice_period_ends_at,
    confirmed_at,
    cancelled_at,
    created_at,
    updated_at
  )
  select
    pl.id,
    '00000000-0000-0000-0000-000000202600'::uuid,
    ir.start_date,
    ir.end_date,
    true,
    false,
    'bestaetigt'::public.booking_status,
    'Import aus altem Google-Kalender 2026',
    null,
    now(),
    null,
    now(),
    now()
  from import_rows ir
  join party_lookup pl on pl.name = ir.family_party_name
  where not exists (
    select 1
    from public.bookings b
    where b.family_party_id = pl.id
      and b.start_date = ir.start_date
      and b.end_date = ir.end_date
      and b.is_priority = true
      and b.status = 'bestaetigt'
      and b.comment = 'Import aus altem Google-Kalender 2026'
  )
  returning id, family_party_id, start_date, end_date
)
insert into public.booking_events (
  booking_id,
  event_type,
  message,
  created_by,
  created_at
)
select
  ib.id,
  'google_calendar_2026_import',
  'Import aus Google-Kalender 2026',
  null,
  now()
from inserted_bookings ib
where not exists (
  select 1
  from public.booking_events be
  where be.booking_id = ib.id
    and be.event_type = 'google_calendar_2026_import'
    and be.message = 'Import aus Google-Kalender 2026'
);
