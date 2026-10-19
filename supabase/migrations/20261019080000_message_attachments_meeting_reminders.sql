-- 1) A ready-made message can carry a file: voice note, video, image/GIF or
--    document (PDF). Files live in the public "media" bucket under <org_id>/.
alter table message_templates add column attachment_url text;
alter table message_templates add column attachment_type text check (attachment_type in ('image', 'video', 'document', 'voice'));
alter table message_templates add column attachment_name text;

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy "members upload org media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1]::uuid in (select my_org_ids()));
create policy "members delete org media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1]::uuid in (select my_org_ids()));

-- 2) Meeting reminders for every meeting, however it was created (button,
--    booking link, calendar): when a business turns this on, each new
--    upcoming meeting with a lead gets its reminder messages queued from the
--    templates marked meeting_reminder_3d / _1d / _day.
alter table organizations add column meeting_reminders boolean not null default false;

create or replace function queue_meeting_reminders() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  at timestamptz;
  local_start timestamp;
begin
  if new.contact_id is null or new.end_at < now() then return new; end if;
  if not coalesce((select meeting_reminders from organizations where id = new.org_id), false) then return new; end if;
  local_start := new.start_at at time zone 'Asia/Jerusalem';
  for t in select id, name, quick_action from message_templates
           where org_id = new.org_id and quick_action in ('meeting_reminder_3d', 'meeting_reminder_1d', 'meeting_reminder_day')
             and (coalesce(body, '') <> '' or attachment_url is not null)
  loop
    at := case t.quick_action
      when 'meeting_reminder_3d' then new.start_at - interval '3 days'
      when 'meeting_reminder_1d' then new.start_at - interval '1 day'
      -- 09:00 Israel time on the day, or two hours before an early meeting
      else least((date_trunc('day', local_start) + interval '9 hours') at time zone 'Asia/Jerusalem', new.start_at - interval '2 hours')
    end;
    if at > now() then
      insert into scheduled_messages (org_id, contact_id, channel_id, template_id, appointment_id, label, send_at, created_by)
      values (new.org_id, new.contact_id, null, t.id, new.id, t.name, at, new.owner_user_id);
    end if;
  end loop;
  return new;
end;
$$;
create trigger appointments_queue_reminders after insert on appointments
  for each row execute function queue_meeting_reminders();
