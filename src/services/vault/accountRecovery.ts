/**
 * Proving you own the account, so a forgotten note PIN is recoverable.
 *
 * THE PROBLEM
 *
 * A locked note's content is sealed under a random note key. That key is stored
 * wrapped under the note's PIN. Forget the PIN and there is no way back: the key
 * cannot be unwrapped, and the plaintext cannot be produced to re-encrypt from,
 * because producing it would require the key. There is no partial credit -- the
 * content is simply gone, for everyone, permanently.
 *
 * THE FIX
 *
 * Wrap the note key under the ACCOUNT PASSWORD as well, once, and the account
 * becomes a second key. Forgetting the note PIN is then a re-wrap rather than a
 * decryption: prove the account password, unwrap the note key with it, wrap that
 * same key under a fresh PIN. The note's content is never touched, never
 * decrypted, never rewritten.
 *
 * This is the model password managers use for their recovery key, and it is the
 * same shape as the recovery phrase that already exists -- a second wrap on the
 * same key, surviving the first one being lost. The difference is only where the
 * second secret comes from.
 *
 * WHY A VERIFIER AND NOT THE KEY ITSELF
 *
 * Storing anything derived from the account password in a column the app can
 * read is a replay target: a database dump plus this code would let an offline
 * attacker test candidate passwords without ever touching Supabase's auth. The
 * verifier here is an AES-GCM wrap of a constant this file also defines, so it is
 * a password check rather than a password-equivalent -- unwrapping it needs the
 * candidate password, and a wrong one fails to authenticate rather than returning
 * a decoy.
 *
 * It is still only as strong as the account password, which is the honest limit
 * of this design. Someone who has the database AND the account password has the
 * notes; someone with the database alone has ciphertext. The same split any
 * server-side account takeover gives you, except here the second factor is a
 * password the database never sees in the clear.
 *
 * CHANGING THE ACCOUNT PASSWORD
 *
 * The verifier stops matching, and every note that was wrapped against it falls
 * back to its remaining wraps: the master key if the app vault is on, otherwise
 * the note PIN. Nothing is lost by changing a password -- the account wrap simply
 * stops being available, and the user re-enables recovery with the new password.
 * That is reported rather than hidden, because silently degrading to "you cannot
 * recover this page any more" is exactly the failure this file exists to remove.
 */

import { supabase } from '../supabaseClient';
import { randomBytes, toBase64, fromBase64 } from '../crypto/bytes';
import { deriveKey, seal, tryOpen } from '../crypto/cipher';
import { PBKDF2_ITERATIONS, SALT_BYTES } from '../crypto/cipher';

/**
 * The plaintext the verifier wraps.
 *
 * Versioned and namespaced like everything else here, so a future change to the
 * scheme can recognise an old verifier and re-derive rather than reading it as a
 * wrong password.
 */
const PROBE = 'anthroweb/account-recovery/v1/probe';

/**
 * Authenticated data for the verifier wrap.
 *
 * Distinct from the AAD used for note keys, so a verifier can never be opened as
 * a note key or the other way round -- the two live in different columns but are
 * both "a thing wrapped under a key derived from a password", and a shared AAD
 * would make them interchangeable.
 */
const VERIFIER_AAD = 'anthroweb/account-recovery/v1/verifier';

export interface AccountRecoveryColumns {
  account_recovery_salt?: string | null;
  account_recovery_iterations?: number | null;
  account_recovery_verifier?: string | null;
}

export const hasAccountRecovery = (row: AccountRecoveryColumns | null | undefined): boolean =>
  Boolean(row?.account_recovery_salt && row?.account_recovery_verifier);

/**
 * Confirm the password belongs to the signed-in account.
 *
 * Goes through Supabase rather than comparing anything locally: Supabase holds
 * the real password hash, and a local comparison could only ever compare against
 * our own verifier, which would accept a password that Supabase no longer
 * considers current. Returns false for both "wrong password" and "no such
 * account" on purpose -- distinguishing them tells an attacker which emails exist.
 *
 * The session is left alone. `signInWithPassword` refreshes the existing session
 * rather than replacing it, so the user does not appear to be logged out by
 * proving who they are.
 */
export const verifyAccountPassword = async (password: string): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  return !error;
};

const deriveAccountKey = (
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) => deriveKey(password, salt, iterations);

/**
 * Turn on account recovery for the signed-in user.
 *
 * The password is verified with Supabase first, so a wrong password here cannot
 * write a verifier nobody will ever be able to satisfy -- which would lock the
 * user's own recovery out silently, the worst outcome this feature has.
 *
 * Returns the columns to persist; the caller writes them, because this file
 * touches no database and is exercised directly by the verification scripts.
 */
export const buildAccountRecovery = async (
  password: string,
): Promise<Partial<AccountRecoveryColumns>> => {
  if (!(await verifyAccountPassword(password))) {
    throw new Error('That is not your account password.');
  }

  const salt = randomBytes(SALT_BYTES);
  const key = await deriveAccountKey(password, salt, PBKDF2_ITERATIONS);
  const verifier = await seal(key, PROBE, VERIFIER_AAD);

  return {
    account_recovery_salt: toBase64(salt),
    account_recovery_iterations: PBKDF2_ITERATIONS,
    account_recovery_verifier: verifier,
  };
};

/**
 * Check a candidate account password against the stored verifier.
 *
 * True means "this is the account password", which is the only thing the caller
 * needs in order to unwrap a note key.
 */
export const checkAccountPassword = async (
  row: AccountRecoveryColumns,
  password: string,
): Promise<boolean> => {
  if (!hasAccountRecovery(row)) return false;
  const salt = row.account_recovery_salt;
  const iterations = row.account_recovery_iterations;
  const verifier = row.account_recovery_verifier;
  if (!salt || !iterations || !verifier) return false;

  const key = await deriveAccountKey(password, fromBase64(salt), iterations);
  const opened = await tryOpen(key, verifier, VERIFIER_AAD);
  return opened === PROBE;
};

/**
 * Derive the account key directly, for wrapping and unwrapping a note key.
 *
 * Separate from `checkAccountPassword` on purpose: that one is a boolean for
 * asking, this one is the key material for doing. The AAD differs from the
 * verifier's so a note key can never be confused with a verifier.
 */
export const deriveAccountWrapKey = async (
  row: AccountRecoveryColumns,
  password: string,
): Promise<CryptoKey | null> => {
  if (!hasAccountRecovery(row)) return null;
  const salt = row.account_recovery_salt;
  const iterations = row.account_recovery_iterations;
  if (!salt || !iterations) return null;

  const candidate = await deriveAccountKey(password, fromBase64(salt), iterations);
  // Re-derived and checked before it is handed out, so a wrong password yields
  // null here rather than a key that fails on every note it touches.
  const ok = await checkAccountPassword(row, password);
  return ok ? candidate : null;
};

/** Turn recovery off and forget the verifier. Existing note wraps stop working. */
export const clearAccountRecovery = (): Partial<AccountRecoveryColumns> => ({
  account_recovery_salt: null,
  account_recovery_iterations: null,
  account_recovery_verifier: null,
});