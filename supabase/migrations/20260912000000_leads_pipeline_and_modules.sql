-- Leads/pipeline core + every module built on mock data so far (calendar,
-- lead forms, automations, notifications). Same pattern as the core schema:
-- every table gets org_id + an RLS policy. Delete on contacts/opportunities/
-- stages/automations is restricted to owner/admin, matching the "agent"
-- role restriction already enforced client-side in the app.

create type activity_type as enum ('note', 'stage_change');
create type automation_trigger_type as enum ('new_contact', 'stage_change', 'tag_added');
create type automation_step_type as enum ('send_message', 'wait', 'add_tag', 'notify');
create type form_field_type as enum ('text', 'phone', 'email', 'textarea');

-- ============================= Leads (contacts) =============================

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  source text,
  tags text[] not null default '{}',
  fields jsonb not null default '{}', -- custom fields, mirrored 1:1 in the UI
  created_at timestamptz not null default now()
);
create index contacts_org_idx on contacts (org_id);

create table contact_field_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- ============================== Pipeline ==============================

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index pipelines_org_idx on pipelines (org_id);

create table stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines (id) on delete cascade,
  name text not null,
  win_probability int not null default 10,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index stages_pipeline_idx on stages (pipeline_id);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  pipeline_id uuid not null references pipelines (id) on delete cascade,
  stage_id uuid not null references stages (id) on delete restrict,
  title text not null,
  value numeric not null default 0,
  created_at timestamptz not null default now()
);
create index opportunities_org_idx on opportunities (org_id);
create index opportunities_contact_idx on opportunities (contact_id);
create index opportunities_pipeline_idx on opportunities (pipeline_id);

-- Timeline: manual notes + auto-logged stage changes, append-only.
create table activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  type activity_type not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index activities_contact_idx on activities (contact_id);

-- ================================ Tasks ================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  title text not null,
  contact_id uuid references contacts (id) on delete set null,
  assignee text,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_org_idx on tasks (org_id);

-- =============================== Calendar ===============================

create table appointment_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  duration_minutes int not null default 30
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid references contacts (id) on delete set null,
  type_id uuid not null references appointment_types (id) on delete restrict,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);
create index appointments_org_idx on appointments (org_id);
create index appointments_start_idx on appointments (start_at);

-- Weekly recurring availability. day: 0 = Sunday .. 6 = Saturday.
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  day int not null check (day between 0 and 6),
  start_time time not null,
  end_time time not null
);
create index availability_org_idx on availability_rules (org_id);

-- ============================== Lead forms ==============================

create table forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms (id) on delete cascade,
  key text not null,
  label text not null,
  type form_field_type not null,
  required boolean not null default false,
  position int not null default 0
);
create index form_fields_form_idx on form_fields (form_id);

-- ============================== Automations ==============================

create table automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  trigger_type automation_trigger_type not null,
  trigger_pipeline_id uuid references pipelines (id) on delete cascade,
  trigger_stage_id uuid references stages (id) on delete cascade,
  trigger_tag text,
  created_at timestamptz not null default now()
);
create index automations_org_idx on automations (org_id);

create table automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations (id) on delete cascade,
  type automation_step_type not null,
  message text,
  wait_minutes int,
  tag text,
  notify_text text,
  position int not null default 0
);
create index automation_steps_automation_idx on automation_steps (automation_id);

-- One row per simulated run, for the "X הפעלות" counter and audit trail.
create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  automation_id uuid not null references automations (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  ran_at timestamptz not null default now(),
  steps_log text[] not null default '{}'
);
create index automation_runs_automation_idx on automation_runs (automation_id);

-- ============================== Notifications ==============================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  text text not null,
  contact_id uuid references contacts (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_org_idx on notifications (org_id);

-- =================================== RLS ===================================

alter table contacts enable row level security;
alter table contact_field_defs enable row level security;
alter table pipelines enable row level security;
alter table stages enable row level security;
alter table opportunities enable row level security;
alter table activities enable row level security;
alter table tasks enable row level security;
alter table appointment_types enable row level security;
alter table appointments enable row level security;
alter table availability_rules enable row level security;
alter table forms enable row level security;
alter table form_fields enable row level security;
alter table automations enable row level security;
alter table automation_steps enable row level security;
alter table automation_runs enable row level security;
alter table notifications enable row level security;

-- Simple org-scoped tables: any member can read/write, no delete restriction.
-- (contact_field_defs, activities, tasks, appointment_types, appointments,
-- availability_rules, forms, automation_runs, notifications)

create policy "members manage contact_field_defs" on contact_field_defs for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage activities" on activities for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage tasks" on tasks for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage appointment_types" on appointment_types for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage appointments" on appointments for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage availability_rules" on availability_rules for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage forms" on forms for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage form_fields" on form_fields for all
  using (
    form_id in (
      select id from forms where org_id in (select org_id from memberships where user_id = auth.uid())
    )
  );

create policy "members manage automation_runs" on automation_runs for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members manage notifications" on notifications for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- Pipelines/stages: any member manages stages, delete restricted below for stages.
create policy "members manage pipelines" on pipelines for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "members select stages" on stages for select
  using (
    pipeline_id in (
      select id from pipelines where org_id in (select org_id from memberships where user_id = auth.uid())
    )
  );
create policy "members insert stages" on stages for insert
  with check (
    pipeline_id in (
      select id from pipelines where org_id in (select org_id from memberships where user_id = auth.uid())
    )
  );
create policy "members update stages" on stages for update
  using (
    pipeline_id in (
      select id from pipelines where org_id in (select org_id from memberships where user_id = auth.uid())
    )
  );
create policy "admins delete stages" on stages for delete
  using (
    pipeline_id in (
      select id from pipelines where org_id in (
        select org_id from memberships where user_id = auth.uid() and role in ('owner', 'admin')
      )
    )
  );

-- Contacts (leads): delete restricted to owner/admin (matches the UI's
-- agent-role restriction — this is the real enforcement, the UI check is
-- just for a good agent experience, not the security boundary).
create policy "members select contacts" on contacts for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "members insert contacts" on contacts for insert
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "members update contacts" on contacts for update
  using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "admins delete contacts" on contacts for delete
  using (
    org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Opportunities: same delete restriction.
create policy "members select opportunities" on opportunities for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "members insert opportunities" on opportunities for insert
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "members update opportunities" on opportunities for update
  using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "admins delete opportunities" on opportunities for delete
  using (
    org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner', 'admin'))
  );

-- Automations: same delete restriction (stopping/editing an automation that
-- messages leads is an admin-level action).
create policy "members select automations" on automations for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "members insert automations" on automations for insert
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "members update automations" on automations for update
  using (org_id in (select org_id from memberships where user_id = auth.uid()));
create policy "admins delete automations" on automations for delete
  using (
    org_id in (select org_id from memberships where user_id = auth.uid() and role in ('owner', 'admin'))
  );
create policy "members manage automation_steps" on automation_steps for all
  using (
    automation_id in (
      select id from automations where org_id in (select org_id from memberships where user_id = auth.uid())
    )
  );
