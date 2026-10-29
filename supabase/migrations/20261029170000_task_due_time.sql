-- A task can have a time of day, not only a date.
alter table tasks add column due_time text check (due_time is null or due_time ~ '^[0-2][0-9]:[0-5][0-9]$');
