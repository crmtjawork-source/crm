-- An invitation used to be honoured only at sign-up (handle_new_user). If the
-- person had already registered before being invited, they stayed outside the
-- team and the invitation sat pending forever. Now a new invitation for an
-- existing account joins that account to the org immediately.
create or replace function public.claim_invitation_for_existing_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(new.email) limit 1;
  if uid is null then
    return new;
  end if;

  insert into public.memberships (org_id, user_id, role, role_id)
  values (new.org_id, uid, new.role, new.role_id)
  on conflict (org_id, user_id) do nothing;

  update public.users set full_name = coalesce(full_name, new.name) where id = uid;

  delete from public.invitations where id = new.id;
  return new;
end;
$$;

drop trigger if exists invitations_claim_existing_user on public.invitations;
create trigger invitations_claim_existing_user
  after insert on public.invitations
  for each row execute function public.claim_invitation_for_existing_user();
