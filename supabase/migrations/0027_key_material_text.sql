-- Key material is `text`, not `bytea`.
--
-- WHAT 0024 GOT WRONG
--
-- 0024's own comment says why `vault` is `text` and not `bytea`:
--
--   "`vault` is `text` holding base64 of `nonce || ciphertext || tag`. Not
--    `bytea`, because PostgREST returns `bytea` as a `\x`-prefixed hex string
--    that has to be decoded on the way back in, and getting that wrong produces
--    a key that silently fails to unwrap."
--
-- Then it declared every wrapped key as `bytea`:
--
--   vault_pin_salt bytea, vault_pin_wrapped bytea,
--   vault_recovery_salt bytea, vault_recovery_wrapped bytea,
--   lock_salt bytea, lock_key_pin bytea, lock_key_master bytea,
--   lock_key_recovery bytea
--
-- The reasoning was correct and was applied to one column out of twenty-four.
-- `fromBase64` calls `atob` directly, and `atob` rejects a `\x`-prefixed hex
-- string outright, so every unlock -- the app PIN, the recovery phrase, a page
-- PIN, account recovery -- threw the platform's own error at the user:
--
--   Failed to execute 'atob' on 'Window': The string to be decoded is not
--   correctly encoded.
--
-- which says nothing about which value was wrong, and is reached by the most
-- ordinary thing in the app: trying to open a locked page.
--
-- THE CONVERSION
--
-- `convert_from(col, 'UTF8')`, not `encode(col, 'base64')`.
--
-- The client has been writing base64 *text* into these `bytea` columns. Postgres
-- reads a plain string into `bytea` as escape format, so what is stored is the
-- ASCII of that base64 string and nothing else -- reading the bytes back as text
-- yields exactly the base64 that was written. `encode(col, 'base64')` would
-- re-encode those ASCII bytes into base64 and produce a string that decodes to
-- the base64 text rather than to the key. It also wraps at 76 characters, which
-- `atob` tolerates but which no longer round-trips byte for byte.
--
-- Rows that were never written are NULL and are untouched.
--
-- WHY EVERY STATEMENT HERE STANDS ALONE
--
-- The obvious way to write this is a single dollar-quoted DO block that loops
-- over the columns and skips any that are absent or already `text`. It was
-- written that way first, and it is wrong in a way no test here would catch.
--
-- A SQL dashboard does not send you a file. It sends whatever you pasted, and
-- how it decides where one statement ends is its own business. Several of them
-- split on the semicolon and nothing else. That cuts a dollar-quoted DO body in
-- half, and the fragment beginning `SELECT format_type(...) INTO column_type`
-- is *valid* plain SQL, because `SELECT ... INTO` in SQL means "into this
-- table". So it runs, and it fails with
--
--   ERROR: 42P01: relation "column_type" does not exist
--
-- which names a relation nobody has ever heard of and points at nothing.
-- `scripts/verify-migrations.mjs` splits with `splitStatements`, which
-- understands dollar-quoted bodies, so it ran the file correctly and passed. The
-- harness and the dashboard disagreed about what a statement is, and only one of
-- them is the thing a person actually types into.
--
-- So there is no DO block, and -- less obviously, and just as much the point --
-- *no semicolon appears anywhere in a comment either*. A splitter that cuts on
-- the first semicolon it finds cuts a comment in half, and the remainder no
-- longer starts with `--`, so it stops looking like a comment and starts looking
-- like the broken fragment from the error above. That is why the prose here
-- spells its examples out in words, and why the COMMENT strings at the bottom
-- carry no `--` of their own. A migration has to survive the worst tool that
-- will run it, not the one that happens to be in front of you.
--
-- The `ADD COLUMN IF NOT EXISTS` lines are no-ops where 0024 and 0025 already
-- created the column, and they are what lets this file also apply to a database
-- that has not reached those migrations -- which is the bare `sql.sql` baseline
-- `verify-migrations.mjs` builds each file against.

BEGIN;

-- ---------------------------------------------------------------------------
-- Keyring, on user_settings.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS vault_pin_salt bytea;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS vault_pin_wrapped bytea;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS vault_recovery_salt bytea;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS vault_recovery_wrapped bytea;

-- ---------------------------------------------------------------------------
-- Account-password recovery material (0025).
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS account_recovery_salt bytea;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS account_recovery_verifier bytea;

-- ---------------------------------------------------------------------------
-- Per-note lock.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS lock_salt bytea;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS lock_key_pin bytea;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS lock_key_master bytea;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS lock_key_recovery bytea;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS lock_key_account bytea;

-- ---------------------------------------------------------------------------
-- The conversion itself.
--
-- `convert_from(col::bytea, 'UTF8')` and not `convert_from(col, 'UTF8')`.
--
-- `convert_from` has exactly one overload and its first argument is `bytea`, so
-- a column that is already `text` makes the plain form a parse error:
--
--   function convert_from(text, unknown) does not exist
--
-- which is what running this file a second time used to produce. The `::bytea`
-- makes the expression valid for both shapes, and it is the right conversion on
-- each:
--
--   column is bytea -- the cast is the identity, so this is convert_from of the
--                      stored bytes, which is the ASCII of the base64
--   column is text  -- the cast gives the bytes of that text, and converting
--                      those bytes back gives the text again
--
-- so the second run is a genuine no-op rather than an error, and this file can
-- be re-pasted after a partial deploy without changing anything.
--
-- The one assumption is that a value in a `text` column is base64, so the bytes
-- are ASCII and contain no backslash -- which matters because `text::bytea` is a
-- bytea *input* parse, where a backslash would start an escape. Nothing here
-- writes backslashes: `seal` and `toBase64` emit `A-Za-z0-9+/=` and nothing else.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings ALTER COLUMN vault_pin_salt TYPE text USING convert_from(vault_pin_salt::bytea, 'UTF8');
ALTER TABLE public.user_settings ALTER COLUMN vault_pin_wrapped TYPE text USING convert_from(vault_pin_wrapped::bytea, 'UTF8');
ALTER TABLE public.user_settings ALTER COLUMN vault_recovery_salt TYPE text USING convert_from(vault_recovery_salt::bytea, 'UTF8');
ALTER TABLE public.user_settings ALTER COLUMN vault_recovery_wrapped TYPE text USING convert_from(vault_recovery_wrapped::bytea, 'UTF8');
ALTER TABLE public.user_settings ALTER COLUMN account_recovery_salt TYPE text USING convert_from(account_recovery_salt::bytea, 'UTF8');
ALTER TABLE public.user_settings ALTER COLUMN account_recovery_verifier TYPE text USING convert_from(account_recovery_verifier::bytea, 'UTF8');

ALTER TABLE public.notes ALTER COLUMN lock_salt TYPE text USING convert_from(lock_salt::bytea, 'UTF8');
ALTER TABLE public.notes ALTER COLUMN lock_key_pin TYPE text USING convert_from(lock_key_pin::bytea, 'UTF8');
ALTER TABLE public.notes ALTER COLUMN lock_key_master TYPE text USING convert_from(lock_key_master::bytea, 'UTF8');
ALTER TABLE public.notes ALTER COLUMN lock_key_recovery TYPE text USING convert_from(lock_key_recovery::bytea, 'UTF8');
ALTER TABLE public.notes ALTER COLUMN lock_key_account TYPE text USING convert_from(lock_key_account::bytea, 'UTF8');

-- ---------------------------------------------------------------------------
-- The comments 0024 wrote described `bytea` columns that were never read as
-- bytes. Rewritten to name the encoding the client actually uses, so the next
-- person to find one of these does not have to rediscover the `atob` problem.
--
-- No `--` and no semicolon inside any of these string literals either, for the
-- same reason the statements above are standalone: a client that strips comments
-- by taking everything after the first `--`, or that splits on every semicolon
-- it can find, would truncate one of these and fail on a syntax error nobody can
-- place.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.user_settings.vault_pin_wrapped IS
  'Base64 of nonce || ciphertext || tag: the master key, AES-256-GCM sealed under a PBKDF2-HMAC-SHA256 key derived from the PIN. text, not bytea, because PostgREST returns bytea as a backslash-x-prefixed hex string and atob rejects that. Useless without the PIN.';
COMMENT ON COLUMN public.user_settings.vault_recovery_wrapped IS
  'Base64 of nonce || ciphertext || tag: the master key, sealed under a PBKDF2-HMAC-SHA256 key derived from the recovery phrase. text, not bytea. The escape hatch for a forgotten PIN, and the reason a forgotten PIN is not data loss.';
COMMENT ON COLUMN public.user_settings.vault_pin_salt IS
  'Base64 of the 16-byte PBKDF2 salt for the PIN wrap. text, not bytea. Written by the client at the moment the vault is armed.';
COMMENT ON COLUMN public.user_settings.vault_recovery_salt IS
  'Base64 of the 16-byte PBKDF2 salt for the recovery wrap. text, not bytea. Independent of the PIN salt, and overwriting one must not disturb the other.';
COMMENT ON COLUMN public.notes.lock_salt IS
  'Base64 of the 16-byte PBKDF2 salt for this page''s PIN wrap. text, not bytea, because PostgREST returns bytea as a backslash-x-prefixed hex string and atob rejects that.';
COMMENT ON COLUMN public.notes.lock_key_pin IS
  'Base64 of nonce || ciphertext || tag: this page''s random note key, AES-256-GCM sealed under PBKDF2(the page PIN). text, not bytea.';
COMMENT ON COLUMN public.notes.lock_key_master IS
  'Base64 of nonce || ciphertext || tag: the note key sealed under the app master key, so an unlocked app reads a locked page without a prompt. text, not bytea. NULL when the app vault is off.';

COMMIT;
