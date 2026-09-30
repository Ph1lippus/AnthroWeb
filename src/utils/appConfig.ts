// ============================================
//   APP-WIDE FEATURE FLAGS
// ============================================

/**
 * Public sign-up is switched off.
 *
 * AnthroWeb is a single-user deployment and the backing Postgres instance has
 * very little free storage, so the app refuses to create new accounts. The flag
 * lives in one place so it can be flipped back on without hunting through the
 * router, the navbar, the landing page and the auth service.
 *
 * Flipping this to `true` restores sign-up everywhere: the /register route, the
 * navbar button, the login page footer link and the landing page call to action
 * all key off this same value.
 *
 * Note: this only closes the app's own entry points. For a hard stop, also
 * turn off "Enable email signups" in the Supabase dashboard, which blocks
 * direct calls to the auth endpoint.
 */
export const REGISTRATION_ENABLED = false;
