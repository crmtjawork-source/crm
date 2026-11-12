-- Messages scheduled from a chat carry their own text (no ready-made template needed).
alter table scheduled_messages add column if not exists body text;
alter table scheduled_messages alter column template_id drop not null;
