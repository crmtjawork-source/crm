-- "gif": a short silent video WhatsApp plays on a loop (sent as video + gifPlayback).
alter table message_templates drop constraint if exists message_templates_attachment_type_check;
alter table message_templates add constraint message_templates_attachment_type_check
  check (attachment_type in ('image', 'video', 'gif', 'document', 'voice'));
