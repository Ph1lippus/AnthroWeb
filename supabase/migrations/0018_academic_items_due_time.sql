-- A clock time on an item's due date.
--
-- `due_date` is a plain calendar date, which is the right shape for "sometime
-- on the 21st" but wrong for the deadlines that have an hour attached -- an
-- exam at 09:00, a submission portal closing at 23:59. Kept as a separate
-- column rather than widening `due_date` to a timestamp: every existing row
-- means "the day, unqualified", and that meaning would have to be re-derived
-- from a midnight timestamp instead of simply being read off a null.
--
-- Null is meaningful and is the default: no hour set means the whole day, and
-- the day is over at midnight as it always was.

ALTER TABLE public.academic_items
    ADD COLUMN IF NOT EXISTS due_time time;
