-- Lead actions for automations: set the lead status, move the deal to a
-- stage, change the lead's owner. (Values travel in field_value.)
alter type automation_step_type add value if not exists 'set_status';
alter type automation_step_type add value if not exists 'move_stage';
alter type automation_step_type add value if not exists 'set_owner';
