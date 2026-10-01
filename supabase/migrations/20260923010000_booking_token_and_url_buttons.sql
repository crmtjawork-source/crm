-- Per-lead booking link. WhatsApp templates allow a URL button with a fixed
-- base and ONE variable suffix, e.g. https://book.example.co.il/{{1}} — the
-- suffix is this token, so the (future) booking page knows which lead is
-- booking without asking for their details again.

alter table contacts
  add column booking_token text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
create unique index contacts_booking_token_idx on contacts (booking_token);

-- Value for the template's dynamic URL button suffix; supports the same
-- placeholders as template params, typically {{booking_token}}. WhatsApp
-- addresses buttons by position, and this is sent for button index 0, so the
-- dynamic URL button must be the template's first button.
alter table automation_steps add column template_button_param text;
