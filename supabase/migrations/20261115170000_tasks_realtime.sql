-- Tasks stream live to every open tab (a colleague's task appears without a refresh).
alter publication supabase_realtime add table tasks;
