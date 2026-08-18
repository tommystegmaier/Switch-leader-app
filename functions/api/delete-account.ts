// Cloudflare Pages Function: POST /api/delete-account
//
// Deletes the signed-in person's own account, for good. Both app stores require
// that an app which lets you create an account also lets you delete it from
// inside the app, without emailing anyone.
//
// Runs with the SERVICE ROLE because removing a row from auth.users is an admin
// operation no ordinary session can perform. The user id comes from the
// verified access token and is never read from the request body, so this can
// only ever delete the caller — there is deliberately no "which user" input.
//
// Everything of theirs goes with it: their memberships, chat messages,
// reactions, votes, schedule assignments and push subscriptions all reference
// auth.users with ON DELETE CASCADE. An app they solely owned is left without
// an owner rather than being deleted — it may have a hundred other people in
// it — and the platform operator can see and reassign it from the command
// center, which already handles the "no owner on record" case.

import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Account deletion is not configured on the server.' }, 500);
  }

  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);
  const uid = userData.user.id;

  // Push subscriptions are ON DELETE SET NULL, not cascade, so they'd otherwise
  // linger as orphaned endpoints that we'd keep trying to push to.
  await admin.from('push_subscriptions').delete().eq('user_id', uid);

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    return json({ error: error.message || 'Could not delete the account.' }, 500);
  }

  return json({ ok: true });
};
