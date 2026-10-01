-- =============================================================================
-- Minimum (pass) grades for subjects and scales.
--
-- Two different thresholds, because they answer different questions:
--
--   academic_courses.minimum_grade  the cut-off for THIS subject. Some courses
--                                   require 12/20, others require 14/20.
--   gpa_scales.passing_grade       the default cut-off for a scale, used by any
--                                   course that has not set its own.
--
-- Both are stored as percentages (0-100), matching final_grade, so switching
-- the active scale between 20/20, 4.0 and 100/100 never rewrites the data. The
-- UI converts at the edges.
--
-- NULL means "no minimum recorded", which is NOT the same as zero: null leaves
-- the question unanswered, zero would fail every course.
--
-- Safe to re-run.
-- =============================================================================

alter table public.academic_courses
    add column if not exists minimum_grade real;

-- Percentage form, so 12/20 stores as 60 and 14/20 as 70.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'academic_courses_minimum_grade_check'
    ) then
        alter table public.academic_courses
            add constraint academic_courses_minimum_grade_check
            check (minimum_grade is null or (minimum_grade >= 0 and minimum_grade <= 100));
    end if;
end $$;

comment on column public.academic_courses.minimum_grade is
    'Percentage (0-100) needed to pass this subject. Null when no minimum applies.';

-- Per-input minimums. A course's own minimum applies to everything in it, but an
-- exam is often held to a higher bar than the subject as a whole, and restating
-- the subject rule on every row would be duplication waiting to drift out of
-- sync. NULL here means "inherit the course's", which is the common case.
alter table public.academic_items
    add column if not exists minimum_grade real;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'academic_items_minimum_grade_check'
    ) then
        alter table public.academic_items
            add constraint academic_items_minimum_grade_check
            check (minimum_grade is null or (minimum_grade >= 0 and minimum_grade <= 100));
    end if;
end $$;

comment on column public.academic_items.minimum_grade is
    'Percentage (0-100) needed to pass this input. Null inherits the course minimum.';

alter table public.gpa_scales
    add column if not exists passing_grade real;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'gpa_scales_passing_grade_check'
    ) then
        alter table public.gpa_scales
            add constraint gpa_scales_passing_grade_check
            check (passing_grade is null or (passing_grade >= 0 and passing_grade <= 100));
    end if;
end $$;

comment on column public.gpa_scales.passing_grade is
    'Percentage (0-100) needed to pass on this scale. Null when the scale defines no minimum.';

-- The item-then-course part of the chain, resolved in one place so the fallback
-- order is not reimplemented in three components. The scale's default is
-- applied in TypeScript, where the active scale is already known.
create or replace function public.effective_minimum_grade(p_item_id uuid)
returns real
language sql
stable
as $$
    select coalesce(
        (select i.minimum_grade
           from public.academic_items i
          where i.id = p_item_id and i.user_id = auth.uid()),
        (select c.minimum_grade
           from public.academic_courses c
          join public.academic_items i2 on i2.course_id = c.id
          where i2.id = p_item_id and c.user_id = auth.uid())
    )
$$;

comment on function public.effective_minimum_grade(uuid) is
    'Percentage needed to pass an item: its own minimum, else its course''s. NULL when neither is set.';

-- Seed the 20/20 preset with the common ECTS pass mark (10/20 = 50%) and 100/100
-- with 50, so the feature is usable immediately. Existing rows are left alone:
-- this only fills presets that have never had a minimum set, and is idempotent.
update public.gpa_scales
   set passing_grade = 50
 where passing_grade is null
   and is_preset = true
   and name in ('20 / 20', '100 / 100');