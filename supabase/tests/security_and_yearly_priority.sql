-- Isolated regression database only. No data survives this transaction.
begin;
insert into public.family_parties(id,name) values ('70000000-0000-0000-0000-000000000001','Security test');
insert into public.profiles(user_id,email,family_party_id,role) values
('70000000-0000-0000-0000-000000000001','moderator@example.invalid','70000000-0000-0000-0000-000000000001','schlichter'),
('70000000-0000-0000-0000-000000000002','member@example.invalid','70000000-0000-0000-0000-000000000001','user'),
('70000000-0000-0000-0000-000000000003','unassigned@example.invalid',null,'user');

do $$ declare saved jsonb; begin
  -- Reserve all of 2051's quota, then try crossing into that year.
  perform public.save_booking(null,'70000000-0000-0000-0000-000000000002',
    '{"start_date":"2051-02-01","end_date":"2051-02-21","is_priority":true}');
  perform public.save_booking(null,'70000000-0000-0000-0000-000000000002',
    '{"start_date":"2051-03-01","end_date":"2051-03-21","is_priority":true}');
  begin
    perform public.save_booking(null,'70000000-0000-0000-0000-000000000002',
      '{"start_date":"2050-12-26","end_date":"2051-01-04","is_priority":true}');
    raise exception 'Cross-year quota was not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Diese Buchung überschreitet deine verfügbare P-Zeit.%' then raise; end if;
  end;
  saved := public.save_booking(null,'70000000-0000-0000-0000-000000000002',
    '{"start_date":"2050-12-26","end_date":"2050-12-31","is_priority":true}');
  if saved->'booking'->>'status' <> 'angefragt' then raise exception 'Unrelated year blocked'; end if;
  if (select count(*) from public.profiles where role='schlichter') = 1 then
    begin
      delete from public.profiles where user_id='70000000-0000-0000-0000-000000000001';
      raise exception 'Last moderator deleted';
    exception when raise_exception then
      if sqlerrm <> 'Es muss mindestens ein Schlichter bestehen bleiben.' then raise; end if;
    end;
    begin
      update public.profiles set role='user' where user_id='70000000-0000-0000-0000-000000000001';
      raise exception 'Last moderator demoted';
    exception when raise_exception then
      if sqlerrm <> 'Es muss mindestens ein Schlichter bestehen bleiben.' then raise; end if;
    end;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"70000000-0000-0000-0000-000000000003"}',true);
do $$ begin
  if (select count(*) from public.bookings) <> 0 then raise exception 'Unassigned user reads bookings'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Unassigned user reads other profiles'; end if;
  if private.has_family_access() then raise exception 'Unassigned user approved'; end if;
  if has_table_privilege('authenticated','public.profiles','INSERT') then raise exception 'Profile self-creation allowed'; end if;
  if has_table_privilege('authenticated','public.booking_events','INSERT') then raise exception 'History forgery allowed'; end if;
end $$;

select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"70000000-0000-0000-0000-000000000002"}',true);
do $$ begin
  if (select count(*) from public.bookings) < 3 then raise exception 'Approved member cannot read bookings'; end if;
  if not private.has_family_access() then raise exception 'Assigned member denied'; end if;
end $$;
reset role;
rollback;
