-- Presets, alarms and preferences for the timer page.
--
-- None of this is a study session. The timer as built records what you set up
-- and how it should behave; the thing it eventually measures is deliberately
-- left for later, when a session has a shape worth storing (a course, a subject,
-- a start and an end, and the difference between work and rest). Splitting the
-- two means this page can ship without deciding what a session *is*, and the
-- tables below never have to be rewritten to find out.
--
-- What lives here instead:
--
--  * `timer_presets` -- reusable durations and interval shapes. Configuration,
--    not history, so a row is deleted when the user deletes the preset.
--  * `timer_alarms` -- a wall-clock time plus the weekdays it repeats on.
--  * `timer_settings` -- one row per user, the preferences the page reads at
--    mount (sound, volume, vibration, notifications, screen wake lock).
--
-- The running timer itself is NOT in here. Its deadline is an absolute
-- timestamp held in `localStorage`, because it has to be readable synchronously
-- on the first paint: waiting on a network round-trip before the display ticks
-- means a spinner over a timer, and a timer that does not survive a reload
-- without a fetch is not a clock. Configuration is synced; the thing on screen
-- right now is local to the device it is on screen in.

-- ---------------------------------------------------------------------------
-- Presets
-- ---------------------------------------------------------------------------
--
-- `seconds` is stored in whole seconds rather than as an interval type or as a
-- string. A duration is not a date-time: it has no zone and no calendar, and
-- storing it as one is how "25 minutes" turns into 25 months the first time
-- somebody reaches for a date library to hold it.
--
-- `kind` separates the two preset shapes rather than giving each its own table.
-- They are both "a configuration you can start", they differ only in which
-- columns are meaningful, and a CHECK is the whole of that difference. A preset
-- of kind 'interval' with a null `seconds` is legitimate; one with both set is
-- not, and is refused.
CREATE TABLE IF NOT EXISTS public.timer_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  seconds integer,
  kind text NOT NULL DEFAULT 'countdown'::text
    CHECK (kind = ANY (ARRAY['countdown'::text, 'interval'::text])),
  -- Interval shape. Null on a countdown preset and meaningful only on an
  -- interval one; see the CHECK below.
  work_seconds integer,
  rest_seconds integer,
  long_rest_seconds integer,
  rounds_before_long integer,
  total_rounds integer,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT timer_presets_pkey PRIMARY KEY (id),
  CONSTRAINT timer_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT timer_presets_seconds_positive CHECK (seconds IS NULL OR seconds > 0),
  CONSTRAINT timer_presets_seconds_fits CHECK (seconds IS NULL OR seconds <= 359999),
  CONSTRAINT timer_presets_work_positive CHECK (work_seconds IS NULL OR work_seconds > 0),
  CONSTRAINT timer_presets_rest_positive CHECK (rest_seconds IS NULL OR rest_seconds > 0),
  -- The two shapes cannot both be filled. A row carrying a duration *and* an
  -- interval shape has no single meaning for the client, and which one it
  -- honoured would be decided by whichever field the code happened to read
  -- first -- so the row is refused instead of being guessed at.
  CONSTRAINT timer_presets_shape_exclusive CHECK (
    (kind = 'countdown' AND seconds IS NOT NULL
      AND work_seconds IS NULL AND rest_seconds IS NULL
      AND long_rest_seconds IS NULL AND rounds_before_long IS NULL AND total_rounds IS NULL)
    OR
    (kind = 'interval' AND seconds IS NULL AND work_seconds IS NOT NULL AND rest_seconds IS NOT NULL)
  ),
  -- 99 hours. The client refuses longer in the digit pad, and this is the same
  -- ceiling asserted at the database so a hand-rolled insert cannot produce a
  -- duration the UI has no way to display or edit.
  CONSTRAINT timer_presets_work_fits CHECK (work_seconds IS NULL OR work_seconds <= 86400)
);

-- Presets render in a fixed order the user controls, and the client always asks
-- for them sorted. Created for every row rather than being partial, because the
-- sort has to be stable across two devices and `created_at` alone reorders the
-- moment two presets are added in the same second.
CREATE INDEX IF NOT EXISTS timer_presets_user_position_idx
  ON public.timer_presets (user_id, position);

-- ---------------------------------------------------------------------------
-- Alarms
-- ---------------------------------------------------------------------------
--
-- `days_of_week` is `int[]` of 0..6 with 0 = Sunday, and an EMPTY array means a
-- one-shot alarm: it fires at the next occurrence and then stands down.
--
-- An empty array rather than a nullable column, or a "repeats" boolean
-- alongside it. Both of those leave two columns that can disagree -- a null
-- array with `repeats = true` is a state no reader is prepared for -- and the
-- absence of a day is genuinely a different thing from "every day", which is
-- all seven entries.
CREATE TABLE IF NOT EXISTS public.timer_alarms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Alarm'::text,
  hour integer NOT NULL CHECK (hour >= 0 AND hour <= 23),
  minute integer NOT NULL CHECK (minute >= 0 AND minute <= 59),
  days_of_week integer[] NOT NULL DEFAULT '{}'::integer[],
  enabled boolean NOT NULL DEFAULT true,
  sound text NOT NULL DEFAULT 'chime'::text
    CHECK (sound = ANY (ARRAY['chime'::text, 'bell'::text, 'digital'::text, 'radar'::text])),
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT timer_alarms_pkey PRIMARY KEY (id),
  CONSTRAINT timer_alarms_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  -- A day index outside 0..6 cannot be scheduled: the client's `nextAlarmFire`
  -- scans real `Date.getDay()` values and would skip such an entry forever
  -- without ever saying so.
  CONSTRAINT timer_alarms_days_valid CHECK (
    days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]
  )
);

CREATE INDEX IF NOT EXISTS timer_alarms_user_position_idx
  ON public.timer_alarms (user_id, position);

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
--
-- One row per user, NOT NULL with defaults on every column, so the page can
-- read it without a single branch on a missing value. A nullable settings
-- table is one that every reader has to defend against, and there is nothing
-- here worth the cost of that.
--
-- `sound` is constrained to the same four ids as `timer_alarms.sound` because
-- they are the same vocabulary read by the same player, and a value one table
-- accepts and the other cannot render is an alarm that fails silently.
CREATE TABLE IF NOT EXISTS public.timer_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  sound text NOT NULL DEFAULT 'chime'::text
    CHECK (sound = ANY (ARRAY['chime'::text, 'bell'::text, 'digital'::text, 'radar'::text])),
  volume real NOT NULL DEFAULT 0.6 CHECK (volume >= 0 AND volume <= 1),
  vibrate boolean NOT NULL DEFAULT true,
  notify boolean NOT NULL DEFAULT true,
  keep_awake boolean NOT NULL DEFAULT true,
  hundredths boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT timer_settings_pkey PRIMARY KEY (id),
  CONSTRAINT timer_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Every table here is per-user and reached only through an authenticated
-- client, so each is owner-only. A policy of `auth.uid() = user_id` rather
-- than "select is true": these are preferences, and a row another user can read
-- is a row that says when this person is not at their desk.
ALTER TABLE public.timer_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own timer presets" ON public.timer_presets;
CREATE POLICY "Users can manage their own timer presets"
  ON public.timer_presets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own timer alarms" ON public.timer_alarms;
CREATE POLICY "Users can manage their own timer alarms"
  ON public.timer_alarms
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own timer settings" ON public.timer_settings;
CREATE POLICY "Users can manage their own timer settings"
  ON public.timer_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);