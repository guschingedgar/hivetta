-- The checker verifies the doorbell secret against Vault, so the secret
-- never leaves the database. Callable by the service role only.
-- Setup (once per environment, not in a migration so the value is never in git):
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--                              'checker_webhook_secret', 'Doorbell secret for check-claim');
create function public.verify_checker_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select decrypted_secret = p_secret and length(p_secret) >= 32
       from vault.decrypted_secrets where name = 'checker_webhook_secret'),
    false)
$$;
revoke all on function public.verify_checker_secret(text) from public, anon, authenticated;
grant execute on function public.verify_checker_secret(text) to service_role;
