ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS body_part text,
    ADD COLUMN IF NOT EXISTS weight_convention text
        CHECK (weight_convention IS NULL OR weight_convention IN ('total', 'per_hand', 'per_side'));

COMMENT ON COLUMN public.exercises.body_part IS 'Primary muscle group or body part for a user-created exercise.';
COMMENT ON COLUMN public.exercises.weight_convention IS 'Whether recorded weight is total, per hand, or per side.';
