-- Moving a meeting moves its pending reminders by the same amount.
create or replace function shift_meeting_reminders() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_at is distinct from old.start_at then
    update scheduled_messages
    set send_at = send_at + (new.start_at - old.start_at)
    where appointment_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger appointments_shift_reminders
  after update of start_at on appointments
  for each row execute function shift_meeting_reminders();
