-- T7: Atomic device-login approval RPC.
-- Replaces the sequential approve flow with a single transactional function
-- that prevents race conditions (concurrent approvals) and revokes only
-- the approving device (not all devices).

create or replace function public.approve_device_login(
  p_request_id          uuid,
  p_approver_id         uuid,
  p_approver_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req           record;
  v_profile       record;
  v_approver_dev  record;
  v_new_device    record;
  v_new_session   record;
begin
  -- 1. Lock and validate the login_request
  select lr.*
    into v_req
    from public.login_requests lr
   where lr.id = p_request_id
     for update skip locked;

  if v_req is null then
    return jsonb_build_object('error', 'Login request not found or already being processed.', 'code', 'not_found');
  end if;

  if v_req.user_id <> p_approver_id then
    return jsonb_build_object('error', 'You do not own this login request.', 'code', 'forbidden');
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('error', 'This request has already been resolved.', 'code', 'already_resolved');
  end if;

  if v_req.expires_at < now() then
    update public.login_requests
       set status = 'expired', resolved_at = now()
     where id = p_request_id;
    return jsonb_build_object('error', 'This login request has expired.', 'code', 'expired');
  end if;

  -- 2. Load the user profile (for max_devices)
  select p.max_devices, p.client_id
    into v_profile
    from public.profiles p
   where p.id = p_approver_id;

  if v_profile is null then
    return jsonb_build_object('error', 'User profile not found.', 'code', 'not_found');
  end if;

  -- 3. Revoke ONLY the approving device (identified by fingerprint)
  update public.devices
     set status = 'revoked',
         revoked_at = now(),
         revoked_reason = 'Approved new device login',
         updated_at = now()
   where user_id = p_approver_id
     and device_id = p_approver_fingerprint
     and status = 'active'
   returning * into v_approver_dev;

  -- Also revoke the approver's device_sessions
  if v_approver_dev.id is not null then
    update public.device_sessions
       set status = 'revoked',
           revoked_at = now(),
           revoked_reason = 'Approved new device login',
           updated_at = now()
     where device_id = v_approver_dev.id
       and status = 'active';
  end if;

  -- 4. Register the new device (upsert)
  insert into public.devices (
    user_id, tenant_id, device_id, user_agent, ip, status, last_seen_at
  ) values (
    p_approver_id,
    v_profile.client_id,
    v_req.device_fingerprint,
    v_req.user_agent,
    v_req.ip,
    'active',
    now()
  )
  on conflict (user_id, device_id) do update
     set status = 'active',
         user_agent = excluded.user_agent,
         ip = excluded.ip,
         last_seen_at = now(),
         revoked_at = null,
         revoked_reason = null,
         updated_at = now()
  returning * into v_new_device;

  -- 5. Create a device_session for the new device
  insert into public.device_sessions (
    device_id, user_id, auth_session_id, status, last_active_at
  ) values (
    v_new_device.id,
    p_approver_id,
    null,  -- will be updated when the waiting client sets its session
    'active',
    now()
  )
  returning * into v_new_session;

  -- 6. Mark the request approved
  update public.login_requests
     set status = 'approved',
         approved_by_device_id = p_approver_fingerprint,
         resolved_at = now()
   where id = p_request_id;

  -- 7. Insert audit log
  insert into public.audit_logs (
    actor_id, entity_type, entity_id, action,
    before_data, after_data, tenant_id, created_by
  ) values (
    p_approver_id,
    'login_request',
    p_request_id,
    'device_approve',
    jsonb_build_object(
      'approver_device', p_approver_fingerprint,
      'requesting_device', v_req.device_fingerprint
    ),
    jsonb_build_object(
      'new_device_id', v_new_device.id,
      'new_session_id', v_new_session.id,
      'revoked_device_id', v_approver_dev.id
    ),
    v_profile.client_id,
    p_approver_id
  );

  -- 8. Return the stored session tokens for handoff
  return jsonb_build_object(
    'ok', true,
    'access_token', v_req.session_access_token,
    'refresh_token', v_req.session_refresh_token,
    'device_session_id', v_new_session.id
  );
end;
$$;

-- Only service_role should call this function
revoke execute on function public.approve_device_login(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_device_login(uuid, uuid, text) to service_role;
