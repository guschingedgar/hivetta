-- Each outbox row carries the pg-boss job id it will become. The relay sends
-- with that id, so a re-send after a crash (sent, not yet marked dispatched)
-- is a no-op rather than a duplicate job.
alter table app.outbox add column job_id uuid not null default gen_random_uuid();
alter table app.outbox add constraint outbox_job_id_key unique (job_id);
