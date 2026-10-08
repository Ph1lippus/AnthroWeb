-- A "finished" marker for academic inputs.
--
-- Scores answer "how did I do"; this answers "is it done yet". Homework that
-- has been handed in but not yet graded has a null score, and until now there
-- was no way to tell it apart from homework nobody has started. The column is
-- deliberately free of any effect on grading: it never feeds the GPA, the
-- prediction, or the weight totals.
--
-- Parents derive their finished state from their children in the UI rather
-- than storing it here, so the column is only ever written for leaf rows.

ALTER TABLE public.academic_items
    ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
