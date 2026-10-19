-- Evolution API (self-hosted WhatsApp gateway): one platform server hosts an
-- "instance" per linked WhatsApp. external_id = instance name.
alter type channel_provider add value if not exists 'evolution';
