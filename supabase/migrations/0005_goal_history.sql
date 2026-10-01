-- =============================================================================
-- Goal history: goals that apply from a date, instead of one global blob.
--
-- `user_settings.active_goals` is a single jsonb overwritten on every save, so
-- every component resolved it as "today's goals" -- including for past days.
-- Raising the water goal therefore changed the denominator used to score logs
-- that were written before the goal existed.
--
-- `goal_history` is an ordered list of dated versions:
--
--     [ { effective_from: '2026-08-01', goals: { ... } },
--       { effective_from: '2026-09-14', goals: { ... } } ]
--
-- A day reads the newest version whose effective_from is on or before it, so past
-- days keep the targets they were logged against. Resolution happens in
-- src/utils/goalHistory.ts.
--
-- `active_goals` is kept and kept in sync as the "current goals" pointer, so
-- existing readers (profile display, goal setup prefill, and anything that has
-- not been migrated to the history yet) keep working unchanged.
--
-- Safe to re-run.
-- =============================================================================

alter table public.user_settings
    add column if not exists goal_history jsonb;

comment on column public.user_settings.goal_history is
    'Dated goal versions. A day resolves to the newest version with effective_from <= that day.';

-- Backfill: seed the history with the goals as they stand today, dated at the
-- user's earliest log. Every existing log therefore resolves to exactly the
-- goals it was scored against before this change -- no retroactive movement,
-- which is the whole point of the migration. Idempotent: rows that already have
-- a history are left alone.
--
-- The alias is required, not cosmetic: the correlated subquery has to reach the
-- row being updated, and an UPDATE target has no name to refer to unless one is
-- declared.
--
-- Both branches of the coalesce are formatted to text rather than relying on a
-- date/text implicit cast. log_date is a `date` column and the app compares
-- these strings lexicographically against local-calendar YYYY-MM-DD, so the
-- format has to match exactly.
update public.user_settings as us
   set goal_history = jsonb_build_array(
        jsonb_build_object(
            'effective_from', coalesce(
                (select to_char(min(l.log_date), 'YYYY-MM-DD')
                   from public.daily_logs l
                  where l.user_id = us.user_id),
                to_char(current_date, 'YYYY-MM-DD')
            ),
            'goals', us.active_goals
        )
   )
 where us.goal_history is null
   and us.active_goals is not null;