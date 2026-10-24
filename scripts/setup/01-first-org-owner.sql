-- Creates the first organization and makes an already signed-up user its owner.
--
-- Run ONCE, after all migrations, in the Supabase SQL editor (or psql),
-- AFTER the owner has signed up in the app (that creates their auth.users +
-- public.users row). Edit the two values below first.
--
-- Everyone else joins through invitations from the Team screen in the app
-- (handle_new_user() turns an invitation into a membership on signup).

do $$
declare
  v_owner_email text := 'owner@example.com';   -- <-- the owner's login email
  v_org_name    text := 'שם העסק';              -- <-- the organization name
  v_user_id uuid;
  v_org_id  uuid;
begin
  select id into v_user_id from public.users where lower(email) = lower(v_owner_email);
  if v_user_id is null then
    raise exception 'No user with email %. Sign up in the app first, then re-run.', v_owner_email;
  end if;

  if exists (select 1 from public.memberships where user_id = v_user_id) then
    raise exception 'User % already belongs to an organization — nothing done.', v_owner_email;
  end if;

  insert into public.organizations (name) values (v_org_name) returning id into v_org_id;
  insert into public.memberships (org_id, user_id, role) values (v_org_id, v_user_id, 'owner');

  raise notice 'Created organization % (%) with owner %', v_org_name, v_org_id, v_owner_email;
end $$;
