-- Embedded Signup: numbers connected through Meta's onboarding popup
-- (as a Tech Provider) instead of pasting IDs and a token by hand.
--
-- 'coexistence' numbers stay live in the WhatsApp Business app on the phone.
-- Meta allows the contacts sync and the history sync to be requested ONCE
-- each, within 24h of onboarding — history_sync_requested_at records that
-- we did, so a retry never fires a second request.

alter table channels add column onboarding text not null default 'manual'
  check (onboarding in ('manual', 'embedded_signup', 'coexistence'));
alter table channels add column onboarded_at timestamptz;
alter table channels add column contacts_sync_requested_at timestamptz;
alter table channels add column history_sync_requested_at timestamptz;

-- Two-step-verification PIN set when we register a brand-new number; needed
-- again if the number is ever re-registered. Service-role only like the token.
alter table channel_credentials add column registration_pin text;
