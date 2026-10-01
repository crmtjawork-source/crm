-- Self-booking: a lead opens their personal link (contacts.booking_token),
-- picks a free slot of the org's bookable appointment type, and the booking
-- fires the new `appointment_booked` automation trigger.

alter type automation_trigger_type add value if not exists 'appointment_booked';

-- Which appointment type leads may book themselves (first match is used).
alter table appointment_types add column public_booking boolean not null default false;

-- Narrows a trigger to leads from one source, e.g. 'meta_lead_ads' so the
-- welcome message goes to Facebook/Instagram form leads only — not to leads
-- typed in by hand or imported from another CRM. Null = any source.
alter table automations add column trigger_source text;

-- Bookings made from the public page must show up in open calendars live.
alter publication supabase_realtime add table appointments;
