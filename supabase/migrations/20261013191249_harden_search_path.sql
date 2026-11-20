-- Pin search_path on the trigger functions the security advisor flagged.
alter function app.forbid_delete() set search_path = '';
alter function app.immutable_except_nulling() set search_path = '';
alter function app.claims_guard_update() set search_path = '';
