-- Invitations need a display name for people who haven't signed up yet
-- (the team page shows a name for pending invites, not just an email).
alter table invitations add column name text;
