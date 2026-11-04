-- Install only after content_queue_sweep.sql; it starts disabled and stores no credential.
create extension if not exists pg_cron;
select cron.schedule('intmed-content-queue-sweep','*/5 * * * *',
  $$select intmed_queue_private.request_sweep();$$);
-- Coordinator enables after deployed-function/auth tests:
-- update public.intmed_queue_sweep_state set enabled=true;
-- Rollback (retains all sources/drafts):
-- update public.intmed_queue_sweep_state set enabled=false;
-- select cron.unschedule('intmed-content-queue-sweep');
