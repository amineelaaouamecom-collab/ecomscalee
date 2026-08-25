begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(29);

select has_table('public', 'notifications', 'Persistent notifications table exists');
select has_table('public', 'notification_preferences', 'Per-event preferences table exists');
select has_table('public', 'notification_user_settings', 'Per-workspace user settings table exists');
select has_table('public', 'push_subscriptions', 'Push subscriptions table exists');
select has_table('public', 'notification_outbox', 'Delivery outbox exists');
select has_table('public', 'notification_deliveries', 'Delivery receipts table exists');
select has_function('public', 'notification_unread_count', array['uuid'], 'Unread count RPC exists');
select has_function('public', 'notification_mark_read', array['uuid','uuid[]','boolean'], 'Constrained read-state RPC exists');
select has_function('public', 'notification_mark_all_read', array['uuid'], 'Mark-all RPC exists');
select has_function('public', 'emit_notification_event_service', array['uuid','text','text','uuid','jsonb','text','uuid','text'], 'Trusted event RPC exists');
select col_is_unique('public', 'notification_preferences', array['workspace_id','user_id','event_key'], 'Preferences are unique per workspace/user/event');
select col_is_unique('public', 'notifications', array['workspace_id','recipient_user_id','dedupe_key'], 'Notification delivery is idempotent per recipient');
select policies_are('public', 'notifications', array['notifications_own_read'], 'Only the recipient-scoped notification read policy exists');
select policies_are('public', 'push_subscriptions', array[]::text[], 'Raw subscription credentials have no browser RLS policy');
select is((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), true, 'Notifications have RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), true, 'Subscriptions have RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass), true, 'Outbox has RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.notification_deliveries'::regclass), true, 'Delivery receipts have RLS enabled');
select is(has_table_privilege('authenticated','public.notifications','INSERT'), false, 'Browser users cannot create arbitrary notifications');
select is(has_table_privilege('authenticated','public.notifications','UPDATE'), false, 'Browser users cannot bypass constrained mutation RPCs');
select is(has_table_privilege('authenticated','public.push_subscriptions','SELECT'), false, 'Browser users cannot read raw subscription credentials');
select is(has_function_privilege('authenticated','public.emit_notification_event_service(uuid,text,text,uuid,jsonb,text,uuid,text)','EXECUTE'), false, 'Browser users cannot emit trusted events');
select is(public.is_active_workspace_member(gen_random_uuid()), false, 'An unrelated workspace fails membership authorization');
select is((select 'agent' = any(allowed_roles) from public.notification_event_catalog where event_key = 'order.created'), false, 'Agents do not receive every new workspace order');
select is((select 'agent' = any(allowed_roles) from public.notification_event_catalog where event_key = 'order.assigned'), true, 'Assigned-order events include confirmation agents');
select has_trigger('public', 'orders', 'notification_order_update', 'Order assignment and status changes are connected');
select has_trigger('public', 'founder_announcements', 'notification_founder_announcement', 'Audited founder announcements are connected');
select is((select count(*)::integer from cron.job where jobname = 'notification-push-dispatch' and active), 1, 'One background push dispatcher is active');
select has_trigger('auth', 'users', 'notification_auth_security_change', 'Auth changes emit trusted recipient-scoped security events');

select * from finish();
rollback;
