-- Store the two journal nodes and their graph metadata as first-class fields.
-- journal_entry remains populated for backwards compatibility with older clients.
ALTER TABLE public.daily_logs
    ADD COLUMN IF NOT EXISTS journal_morning text,
    ADD COLUMN IF NOT EXISTS journal_evening text,
    ADD COLUMN IF NOT EXISTS journal_sentiment text
        CHECK (journal_sentiment IS NULL OR journal_sentiment IN ('good', 'bad', 'mixed')),
    ADD COLUMN IF NOT EXISTS journal_links text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.daily_logs.journal_morning IS
    'TipTap HTML for the proactive morning journal node';
COMMENT ON COLUMN public.daily_logs.journal_evening IS
    'TipTap HTML for the reactive evening journal node';
COMMENT ON COLUMN public.daily_logs.journal_sentiment IS
    'Graph anchor: good, bad, or mixed';
COMMENT ON COLUMN public.daily_logs.journal_links IS
    'Comma-separated topic anchors selected for this journal day';
