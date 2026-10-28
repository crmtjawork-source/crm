-- The same WhatsApp message id shows up on both numbers when two linked numbers
-- share a chat or a group, so uniqueness is per conversation, not per business.
alter table messages drop constraint messages_org_id_external_id_key;
create unique index messages_conversation_external_key on messages (conversation_id, external_id);
