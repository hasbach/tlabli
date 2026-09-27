-- 15_drivers_smoke.sql
-- Smoke test for 15_drivers.sql. Paste into Supabase Studio's SQL Editor and
-- run AFTER 15_drivers.sql. Runs entirely inside a transaction that is rolled
-- back at the end, so it leaves no data behind. Success = the notice
-- "drivers smoke test: all assertions passed" and no error.
--
-- The SQL Editor runs as `postgres`, which bypasses RLS — so this checks the
-- functions' own logic (token checks, assignment rules, status rules, event
-- log), not the RLS scoping of the security-invoker owner functions. That part
-- is covered by the manual pass in the plan's final task.

begin;

do $$
declare
  v_restaurant uuid;
  v_restaurant2 uuid;
  v_driver_a uuid;
  v_driver_b uuid;
  v_driver_c uuid;
  v_order uuid;
  v_order2 uuid;
  v_pickup_order uuid;
  v_token_a text;
  v_token_b text;
  v_old_token text;
  v_json jsonb;
  v_ok boolean;
begin
  -- Grants: anon must never reach driver_from_token (it's SECURITY DEFINER
  -- and returns the full drivers row, including token_hash) or the
  -- owner-side RPCs; driver-side RPCs stay open to anon (the token is the
  -- only credential a driver has).
  assert not has_function_privilege('anon', 'public.driver_from_token(text)', 'execute'), 'anon cannot call driver_from_token';
  assert not has_function_privilege('authenticated', 'public.driver_from_token(text)', 'execute'), 'authenticated cannot call driver_from_token';
  assert not has_function_privilege('anon', 'public.reset_driver_link(uuid)', 'execute'), 'anon cannot call reset_driver_link';
  assert not has_function_privilege('anon', 'public.assign_order_driver(uuid, uuid)', 'execute'), 'anon cannot call assign_order_driver';
  assert not has_function_privilege('anon', 'public.set_driver_active(uuid, boolean)', 'execute'), 'anon cannot call set_driver_active';
  assert has_function_privilege('anon', 'public.driver_get_orders(text)', 'execute'), 'anon can call driver_get_orders';

  insert into public.restaurants (name, slug, type, template_id)
  values ('Smoke Test', 'smoke-test-drivers-' || gen_random_uuid(), 'fast-food', 'fast-food')
  returning id into v_restaurant;

  insert into public.drivers (restaurant_id, name, phone) values (v_restaurant, 'Driver A', '+96170000001')
  returning id into v_driver_a;
  insert into public.drivers (restaurant_id, name, phone) values (v_restaurant, 'Driver B', '+96170000002')
  returning id into v_driver_b;

  insert into public.orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, address, items, total, currency)
  values (v_restaurant, 1, 'Customer', '+96170000003', 'delivery', 'Hamra St', '[]', 10, 'USD')
  returning id into v_order;

  -- A driver from another restaurant can't be assigned, even to an
  -- unassigned order in this restaurant.
  insert into public.restaurants (name, slug, type, template_id)
  values ('Smoke Test 2', 'smoke-test-drivers-2-' || gen_random_uuid(), 'fast-food', 'fast-food')
  returning id into v_restaurant2;
  insert into public.drivers (restaurant_id, name, phone) values (v_restaurant2, 'Driver C', '+96170000006')
  returning id into v_driver_c;
  begin
    perform public.assign_order_driver(v_order, v_driver_c);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'driver_not_found';
  end;
  assert v_ok, 'driver from another restaurant gets driver_not_found';

  -- Links: 48 hex chars, stored hashed.
  v_token_a := public.reset_driver_link(v_driver_a);
  v_token_b := public.reset_driver_link(v_driver_b);
  assert length(v_token_a) = 48, 'token is 48 chars';
  assert (select token_hash from public.drivers where id = v_driver_a) <> v_token_a, 'token stored hashed, not plaintext';
  assert (select token_created_at from public.drivers where id = v_driver_a) is not null, 'token_created_at set';

  -- Bad token rejected.
  begin
    perform public.driver_get_orders('not-a-real-token');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'invalid_link';
  end;
  assert v_ok, 'bad token raises invalid_link';

  -- Assign A: only A sees it; customer sees the driver.
  perform public.assign_order_driver(v_order, v_driver_a);
  v_json := public.driver_get_orders(v_token_a);
  assert jsonb_array_length(v_json->'orders') = 1, 'driver A sees the assigned order';
  assert v_json->'driver'->>'name' = 'Driver A', 'driver name returned';
  assert jsonb_array_length(public.driver_get_orders(v_token_b)->'orders') = 0, 'driver B sees nothing';
  assert (select count(*) from public.get_order_driver(v_order)) = 1, 'customer sees the driver';
  assert (select name from public.get_order_driver(v_order)) = 'Driver A', 'customer sees the right driver name';

  -- Picked up.
  perform public.driver_mark_picked_up(v_token_a, v_order);
  assert (select status from public.orders where id = v_order) = 'out_for_delivery', 'picked up -> out_for_delivery';

  -- Reassign to B: A is locked out.
  perform public.assign_order_driver(v_order, v_driver_b);
  begin
    perform public.driver_mark_delivered(v_token_a, v_order);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'not_assigned';
  end;
  assert v_ok, 'reassigned-away driver gets not_assigned';

  -- Wrong transition for B.
  begin
    perform public.driver_mark_picked_up(v_token_b, v_order);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'bad_status';
  end;
  assert v_ok, 'picking up an out_for_delivery order gets bad_status';

  -- B delivers.
  perform public.driver_mark_delivered(v_token_b, v_order);
  assert (select status from public.orders where id = v_order) = 'completed', 'delivered -> completed';
  assert (select count(*) from public.get_order_driver(v_order)) = 0, 'customer no longer sees driver after completion';

  -- Finished orders can't be reassigned.
  begin
    perform public.assign_order_driver(v_order, v_driver_a);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'order_finished';
  end;
  assert v_ok, 'assigning a completed order gets order_finished';

  -- Event log: assigned A, picked_up, unassigned A, assigned B, delivered.
  assert (select count(*) from public.order_driver_events where order_id = v_order) = 5, 'five events logged';
  assert (select count(*) from public.order_driver_events where order_id = v_order and actor = 'driver') = 2, 'two driver events';

  -- Reset link: old token dies, new one works.
  v_old_token := v_token_b;
  v_token_b := public.reset_driver_link(v_driver_b);
  begin
    perform public.driver_get_orders(v_old_token);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'invalid_link';
  end;
  assert v_ok, 'old token invalid after reset';
  perform public.driver_get_orders(v_token_b);

  -- Deactivate: unassigns active orders and kills the link.
  insert into public.orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, address, items, total, currency)
  values (v_restaurant, 2, 'Customer 2', '+96170000004', 'delivery', 'Achrafieh', '[]', 5, 'USD')
  returning id into v_order2;
  perform public.assign_order_driver(v_order2, v_driver_b);
  assert public.set_driver_active(v_driver_b, false) = 1, 'deactivate unassigns one order';
  assert (select driver_id from public.orders where id = v_order2) is null, 'order2 unassigned';
  begin
    perform public.driver_get_orders(v_token_b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'invalid_link';
  end;
  assert v_ok, 'deactivated driver link is dead';

  -- Inactive drivers can't be assigned or get a new link.
  begin
    perform public.assign_order_driver(v_order2, v_driver_b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'driver_inactive';
  end;
  assert v_ok, 'assigning an inactive driver gets driver_inactive';
  begin
    perform public.reset_driver_link(v_driver_b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'driver_not_found_or_inactive';
  end;
  assert v_ok, 'resetting an inactive driver link fails';

  -- Pickup orders can't have a driver.
  insert into public.orders (restaurant_id, queue_number, customer_name, customer_phone, order_type, items, total, currency)
  values (v_restaurant, 3, 'Customer 3', '+96170000005', 'pickup', '[]', 5, 'USD')
  returning id into v_pickup_order;
  begin
    perform public.assign_order_driver(v_pickup_order, v_driver_a);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm = 'not_a_delivery_order';
  end;
  assert v_ok, 'pickup order rejects a driver';

  raise notice 'drivers smoke test: all assertions passed';
end $$;

rollback;
