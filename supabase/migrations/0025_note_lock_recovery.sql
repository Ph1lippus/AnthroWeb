-- A note lock that can be recovered, and a lockout that survives a reload.
--
-- WHAT 0024 GOT WRONG
--
-- 0024 made a note's PIN unwinnable. `armNoteLock` refused to arm without the
-- app master key, so locking a page required the whole-app vault to be on
-- first -- a feature that has nothing to do with it refusing to depend on
-- another. And because the note key was then reachable only through that master
-- key, forgetting the PIN meant the content was gone: no plaintext to re-encrypt
-- from, no key to re-wrap under a new PIN.
--
-- The fix is the one password managers use. The note key gets wrapped under the
-- ACCOUNT PASSWORD as well, so proving you own the account is enough to unwrap
-- the key and re-wrap it under a fresh PIN. The plaintext is never needed, so
-- nothing has to be decrypted to recover a page.
--
-- 1. lock_key_account
--
--    The note key wrapped under PBKDF2(account password). Optional: present only
--    once the account has an account-recovery key, which is opt-in and captured
--    once in Settings -> Security rather than on every lock.
--
-- 2. notes_lock_consistent relaxed
--
--    0024 required lock_key_master on every locked note. That is the constraint
--    that made independence impossible, and it has to go before any of this
--    works -- a note locked with the vault off has no master wrap at all.
--    lock_key_pin stays required, because a lock nothing can open is not a lock.
--
-- 3. Lockout counters on user_settings
--
--    Per-note locks already count failures in notes.lock_failed_attempts, which
--    survives a reload because it lives in the row. The app PIN had no counter
--    at all: useAppLock leaned on "600k PBKDF2 iterations is slow" as its
--    throttle, which stops nobody who can open a page. These columns give the
--    app lock the same server-side counter the note lock already had.
--
-- 4. Account recovery material on user_settings
--
--    A salt and a wrapped known-plaintext. The verifier is what lets the app
--    check "is this the account password" without storing the password or
--    anything derived from it that a database dump could replay. It is a wrap
--    of a constant this file also defines, so possessing it proves nothing --
--    only successfully unwrapping it with a candidate password does.
--
-- ADditive and idempotent throughout. No existing row is read or rewritten, and
-- every column defaults to the state a database that has never seen this file is
-- already in.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Account-password wrap for a note's key.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS lock_key_account bytea;

COMMENT ON COLUMN public.notes.lock_key_account IS
  'Note key sealed under PBKDF2(account password). NULL when the account has no recovery key yet. Present means a forgotten note PIN is recoverable by proving ownership of the account, without the plaintext ever being decrypted.';

-- ---------------------------------------------------------------------------
-- 2. A locked note no longer requires a master wrap.
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated rather than altered, because CHECK constraints cannot be
-- relaxed in place and the new definition differs in one clause only. The
-- iteration floor stays: a zero would make PBKDF2 return the PIN unchanged.
--
-- Guarded on `lock_enabled` existing rather than assumed, because that column is
-- created by 0024. Against a database where 0024 has not run there is no lock to
-- relax, and the definition below would fail on a column that does not exist --
-- taking the rest of this migration down with it, since the file is one
-- transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'notes'
       AND column_name = 'lock_enabled'
  ) THEN
    RAISE NOTICE 'notes.lock_enabled does not exist; 0024 has not been applied, nothing to relax';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_lock_consistent';
  EXECUTE $q$
    ALTER TABLE public.notes
      ADD CONSTRAINT notes_lock_consistent CHECK (
        NOT lock_enabled OR (
          lock_salt IS NOT NULL
          AND lock_iterations >= 100000
          AND lock_key_pin IS NOT NULL
        )
      )
  $q$;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Server-side lockout for the app PIN.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS vault_failed_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vault_retry_after timestamp with time zone;

COMMENT ON COLUMN public.user_settings.vault_failed_attempts IS
  'Consecutive failed app-PIN attempts. Server-side so clearing browser storage does not reset the throttle.';
COMMENT ON COLUMN public.user_settings.vault_retry_after IS
  'When the app PIN refuses further attempts until. NULL means no throttle is active.';

-- ---------------------------------------------------------------------------
-- 4. Account recovery material.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS account_recovery_salt bytea,
  ADD COLUMN IF NOT EXISTS account_recovery_iterations integer,
  ADD COLUMN IF NOT EXISTS account_recovery_verifier bytea;

-- The probe string is `anthroweb/account-recovery/v1/probe`, defined as `PROBE`
-- in `src/services/vault/accountRecovery.ts`. Spelled out here rather than
-- referred to by name alone: this comment previously named a different string,
-- which is harmless at runtime -- a COMMENT is documentation, not an input -- and
-- very expensive for whoever reads this column expecting it to describe what the
-- code does.
COMMENT ON COLUMN public.user_settings.account_recovery_verifier IS
  'AES-256-GCM wrap of the literal string "anthroweb/account-recovery/v1/probe" under PBKDF2(account password), bound to the AAD "anthroweb/account-recovery/v1/verifier". Unwrapping it proves a candidate password is the account password; the plaintext is a constant defined in PROBE, not the password or anything derived from it. NULL until the user opts in at Settings -> Security.';

COMMIT;