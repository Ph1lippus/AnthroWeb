-- Client-side encryption for everything the app would not want on disk.
--
-- THE MODEL
--
-- Encryption happens in the browser. The server stores ciphertext it cannot
-- read, and the key never leaves the device in a form anything can use. There is
-- no server-side secret involved, deliberately: a key held by the backend is a
-- key the backend can read, and the point of this is that a copy of the database
-- is a copy of a pile of ciphertext.
--
--   passphrase ──PBKDF2-SHA256(salt, iterations)──► KEK ──unwrap──► master key
--   recovery phrase ──PBKDF2-SHA256(salt, iterations)──► KEK ──unwrap──► master key
--
-- The master key is random, generated once, and never transmitted. Two wrapped
-- copies of it are stored: one under a key derived from the user's PIN, one
-- under a key derived from a recovery phrase shown to them exactly once. The
-- wrapped copies are useless on their own -- an attacker with the whole database
-- learns only that a 32-byte key exists, and has to guess a PIN to unwrap it.
-- The recovery wrap is what keeps a forgotten PIN from being unrecoverable
-- rather than merely inconvenient.
--
-- Iteration counts are stored per row rather than hardcoded, because the right
-- number moves: 600_000 is the current OWASP figure for PBKDF2-HMAC-SHA256 and
-- will be higher in a few years, and a value baked into the client would freeze
-- the cost factor at whatever it was on the day someone wrote it. Reading it
-- back from here means the cost can be raised for every user at once, and raised
-- again later, without a client release.
--
-- WHY ONE PAYLOAD COLUMN PER ROW RATHER THAN ONE COLUMN PER FIELD
--
-- The alternative is an `_enc` column beside every sensitive column, which looks
-- tidier and is not. This application computes everything client-side: the daily
-- score, the sleep duration, the body-composition ratios, every chart in the
-- dashboard and the mind graphs. All of that runs over rows the client already
-- has. So a row's sensitive fields are sealed together into one blob, and the
-- row keeps only the keys needed to *find* it -- `id`, `user_id`, `log_date`,
-- ordering -- in the clear. Row level security, unique constraints, date-range
-- filters and sort order keep working exactly as they do, and on read the
-- payload is decrypted and merged back into the row object, so every consumer
-- downstream sees the shape it always saw.
--
-- The alternative also leaks. Per-field encryption leaves `length`, ordering,
-- nullability and equality of each value observable: an attacker learns that
-- `journal_morning` is longer today than yesterday, that a weight is within a
-- kilo of last week's, that exactly one row this month has a blood-pressure
-- reading. Sealing the whole payload removes all of it, because the only thing
-- the server learns is that the row has some private content.
--
-- `vault` is `text` holding base64 of `nonce || ciphertext || tag`. Not `bytea`,
-- because PostgREST returns `bytea` as a `\x`-prefixed hex string that has to
-- be decoded on the way back in, and getting that wrong produces a key that
-- silently fails to unwrap. Base64 is text in and text out on both sides.
--
-- NULL means "not sealed", which is every existing row until the user opts in.
-- That is deliberate: encryption is off by default, so this migration changes no
-- behaviour and no user loses access to anything. `sealPayloads()` does the
-- backfill, from the client, where the key is.

BEGIN;

-- ---------------------------------------------------------------------------
-- Keyring, on user_settings. One row per user, so this is the only place the
-- wrapped master key exists.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS vault_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vault_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS vault_enabled_at timestamp with time zone,
  -- PIN side.
  ADD COLUMN IF NOT EXISTS vault_pin_salt bytea,
  ADD COLUMN IF NOT EXISTS vault_pin_iterations integer,
  ADD COLUMN IF NOT EXISTS vault_pin_wrapped bytea,
  -- Recovery side. Deliberately separate columns rather than one reused one:
  -- they have independent salts and independent iteration counts, and
  -- overwriting one must not disturb the other.
  ADD COLUMN IF NOT EXISTS vault_recovery_salt bytea,
  ADD COLUMN IF NOT EXISTS vault_recovery_iterations integer,
  ADD COLUMN IF NOT EXISTS vault_recovery_wrapped bytea,
  -- Incremented on every PIN change so a slow client holding a stale key
  -- notices instead of writing data nothing can read.
  ADD COLUMN IF NOT EXISTS vault_pin_changed_at timestamp with time zone;

-- One arming state, or the shape is wrong. A row cannot be half-enabled: a
-- flag with no wrapped key is a user who believes they are protected and is not,
-- which is the single worst state   this feature can be in.
--
-- The lower bound on iterations is the point of the constraint. A zero or a
-- negative value here would not fail loudly -- it would make PBKDF2 return its
-- password unchanged, and every PIN in the world would unwrap the key.
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_vault_consistent;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_vault_consistent CHECK (
    NOT vault_enabled OR (
      vault_pin_salt IS NOT NULL
      AND vault_pin_iterations >= 100000
      AND vault_pin_wrapped IS NOT NULL
      AND vault_recovery_salt IS NOT NULL
      AND vault_recovery_iterations >= 100000
      AND vault_recovery_wrapped IS NOT NULL
    )
  );

COMMENT ON COLUMN public.user_settings.vault_enabled IS
  'True once the user has set a PIN and their private fields are sealed. False means every query path reads and writes plaintext exactly as before.';
COMMENT ON COLUMN public.user_settings.vault_pin_wrapped IS
  'Master key, AES-256-GCM sealed under a PBKDF2-HMAC-SHA256 key derived from the PIN. Useless without the PIN.';
COMMENT ON COLUMN public.user_settings.vault_recovery_wrapped IS
  'Master key, sealed under a key derived from the recovery phrase. The escape hatch for a forgotten PIN, and the reason a forgotten PIN is not data loss.';

-- ---------------------------------------------------------------------------
-- Per-note lock.
--
-- A note can be locked with its own PIN independently of the app lock, which is
-- what makes "keep this one hidden" possible when someone shares the device.
--
-- The note's key is random and generated at lock time, not derived from the
-- note's PIN -- and that is the whole design. A derived key cannot be stored, so
-- opening the note would mean re-deriving it, which is fine, but it also cannot
-- be re-wrapped, so a PIN change would mean re-encrypting the entire note. With
-- a random key wrapped three ways, changing the PIN re-wraps 32 bytes instead of
-- rewriting the document, and the note's own key stays usable by the recovery
-- phrase and by the app master key independently of which PIN is set.
--
-- Three wraps, deliberately: the note PIN is what the user types at the note,
-- the master wrap is what an unlocked app uses so a locked note still renders
-- without a prompt once the app is open, and the recovery wrap is what survives
-- both of those being gone.
--
-- `title` is inside the sealed payload for a locked note. A sidebar showing
-- "🔒 Locked" next to a readable title has leaked the part most people are
-- actually trying to hide -- the title is the informative part.
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS lock_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_salt bytea,
  ADD COLUMN IF NOT EXISTS lock_iterations integer,
  ADD COLUMN IF NOT EXISTS lock_key_pin bytea,
  ADD COLUMN IF NOT EXISTS lock_key_master bytea,
  ADD COLUMN IF NOT EXISTS lock_key_recovery bytea,
  ADD COLUMN IF NOT EXISTS lock_failed_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_retry_after timestamp with time zone;

-- Same shape as the app keyring: an armed lock with no key is worse than none.
--
-- `lock_key_recovery` is deliberately NOT required. The third wrap would mean
-- asking the user for their 24-word app recovery phrase every time they lock a
-- single page, and it would add no capability: a lost note PIN is already
-- recoverable by unlocking the app with the recovery phrase and reading the
-- master wrap. Two wraps cover both loss cases -- the note PIN and the app being
-- locked -- and a third one only adds a step.
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_lock_consistent;
ALTER TABLE public.notes
  ADD CONSTRAINT notes_lock_consistent CHECK (
    NOT lock_enabled OR (
      lock_salt IS NOT NULL
      AND lock_iterations >= 100000
      AND lock_key_pin IS NOT NULL
      AND lock_key_master IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Sealed payloads.
--
-- One `vault` column per table, base64 of nonce || ciphertext || tag.
--
-- The tables are the ones holding free text, mental and physical health,
-- identity, or anything the user defined and the schema therefore cannot
-- classify. Not included, and the reasoning is uniform: `exercises` is a
-- reference catalog with no personal content; `grading_scales` and `gpa_scales`
-- are grading systems rather than grades; `daily_log_projects` and
-- `project_plan_items` are relationships already reachable from a sealed parent;
-- `timer_settings` is sound and volume preferences. `book_progress_log` is
-- included because a per-day reading timeline supports inference about what
-- someone is studying.
--
-- `daily_logs` is the one that matters most by a wide margin. It carries blood
-- pressure, heart rate and temperature on top of the journal prose, and the
-- journal is the field in this schema whose disclosure would be worst.
DO $$
DECLARE
  target text;
  sealed text[] := ARRAY[
    'abstinence_goals',
    'abstinence_history',
    'academic_assessments',
    'academic_courses',
    'academic_grades',
    'academic_goals',
    'academic_items',
    'body_measurements',
    'book_progress_log',
    'books',
    'custom_measurements',
    'daily_logs',
    'habits',
    'notes',
    'projects',
    'study_sessions',
    'timer_alarms',
    'timer_presets',
    'user_settings',
    'workout_completion_log',
    'workout_exercises_log',
    'workout_plan_sessions',
    'workout_template_exercises',
    'workout_templates'
  ];
BEGIN
  FOREACH target IN ARRAY sealed LOOP
    IF to_regclass('public.' || quote_ident(target)) IS NULL THEN
      RAISE NOTICE 'skipping %: table does not exist', target;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS vault text', target);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.vault IS %L',
      target,
      'AES-256-GCM sealed private fields for this row, base64(nonce || ciphertext || tag). NULL means not sealed. Row keys stay in the clear so RLS, unique constraints and date filters keep working.'
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Read-your-own-sealed-rows index.
--
-- Not performance. With RLS forced, every read filters on `user_id` anyway, but
-- a partial index on `vault IS NOT NULL` is what makes the sealed subset cheap to
-- enumerate while a user is sealing it -- that walk touches every row they have
-- ever written, and it is the one operation here that is a full scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS daily_logs_user_sealed_idx
  ON public.daily_logs (user_id, log_date)
  WHERE vault IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_user_sealed_idx
  ON public.notes (user_id)
  WHERE vault IS NOT NULL;

COMMIT;