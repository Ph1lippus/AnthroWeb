-- Three more derived body-fat columns and a BMI column.
--
-- The US Navy circumference equation was being evaluated with centimetres
-- converted to inches first, which pushed its log terms through a different scale
-- and read roughly six points low for anyone entering metric. The Hodgdon &
-- Beckett equations take centimetres directly, so the conversion was removed.
-- `body_fat_ymca` is the YMCA method (waist and weight only) and `bmi` is the
-- straightforward weight/height index; both are computed client-side and stored
-- alongside the existing derived columns so the breakdown and the charts can read
-- them back without recomputing.
ALTER TABLE public.body_measurements
    ADD COLUMN IF NOT EXISTS bmi numeric,
    ADD COLUMN IF NOT EXISTS body_fat_ymca numeric;

COMMENT ON COLUMN public.body_measurements.bmi IS 'Body-mass index: weight (kg) / height (m)^2.';
COMMENT ON COLUMN public.body_measurements.body_fat_ymca IS 'YMCA body-fat estimate: waist and weight only, no neck or height needed.';