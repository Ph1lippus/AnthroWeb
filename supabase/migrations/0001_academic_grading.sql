-- =============================================================================
-- Academic grading schema.
--
-- The legacy tables (academic_semesters, academic_grades, academic_goals,
-- academic_assessments, study_sessions) already exist in sql.sql. This migration
-- adds the newer grading model that replaced the flat one:
--
--   academic_semesters  (existing)  one term
--     academic_courses              a subject, carrying credits + final grade
--       academic_items              graded inputs, nested via parent_id
--   gpa_scales                      how a percentage reads (20/20, 4.0, ...)
--     gpa_scale_bands               the percentage -> points bands
--
-- Written to be re-runnable: the tables may already exist because they were
-- created in the Supabase dashboard before this file was committed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- academic_courses
-- -----------------------------------------------------------------------------
create table if not exists public.academic_courses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    semester_id uuid references public.academic_semesters (id) on delete cascade,
    name text not null,
    code text,
    credits real not null default 6 check (credits >= 0),
    -- Stored as an unscaled percentage (0-100). The active scale converts it on
    -- the way in and out, so switching from 20/20 to 100/100 never rewrites data.
    final_grade real check (final_grade is null or (final_grade >= 0 and final_grade <= 100)),
    notes text,
    order_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists academic_courses_user_idx on public.academic_courses (user_id);
create index if not exists academic_courses_semester_idx on public.academic_courses (semester_id);

-- -----------------------------------------------------------------------------
-- academic_items
-- -----------------------------------------------------------------------------
create table if not exists public.academic_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    course_id uuid not null references public.academic_courses (id) on delete cascade,
    -- Self-reference gives arbitrary nesting. Deleting a parent removes the whole
    -- sub-tree, which is what the UI's delete confirmation promises.
    parent_id uuid references public.academic_items (id) on delete cascade,
    name text not null,
    category text not null default 'homework',
    -- The user's own percentage within its sibling group. Never normalised
    -- automatically; Distribute/Normalise only run from an explicit click.
    weight real not null default 0 check (weight >= 0),
    max_score real not null default 100 check (max_score > 0),
    -- null means "not graded yet" (unknown), never zero.
    score real,
    due_date date,
    order_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists academic_items_user_idx on public.academic_items (user_id);
create index if not exists academic_items_course_idx on public.academic_items (course_id);
create index if not exists academic_items_parent_idx on public.academic_items (parent_id);

-- -----------------------------------------------------------------------------
-- gpa_scales
-- -----------------------------------------------------------------------------
create table if not exists public.gpa_scales (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    -- 'percentage': the stored percentage is mapped through bands (or rounding).
    -- 'points':     the percentage is already the grade (100/100).
    basis text not null default 'percentage' check (basis in ('percentage', 'points')),
    max_value real not null default 4 check (max_value > 0),
    min_value real not null default 0,
    is_preset boolean not null default false,
    sort_order integer not null default 0,
    -- How a continuous result becomes the integer grade the teacher reports.
    -- Only used by bandless scales (20/20, 100/100); banded scales ignore it.
    rounding text not null default 'nearest' check (rounding in ('nearest', 'floor', 'ceil')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- The column may be missing on tables created before rounding existed.
alter table public.gpa_scales
    add column if not exists rounding text not null default 'nearest';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'gpa_scales_rounding_check'
    ) then
        alter table public.gpa_scales
            add constraint gpa_scales_rounding_check
            check (rounding in ('nearest', 'floor', 'ceil'));
    end if;
end $$;

create index if not exists gpa_scales_user_idx on public.gpa_scales (user_id);

-- -----------------------------------------------------------------------------
-- gpa_scale_bands
-- -----------------------------------------------------------------------------
create table if not exists public.gpa_scale_bands (
    id uuid primary key default gen_random_uuid(),
    scale_id uuid not null references public.gpa_scales (id) on delete cascade,
    min_percentage real not null check (min_percentage >= 0 and min_percentage <= 100),
    points real not null,
    letter text,
    created_at timestamptz not null default now()
);

create index if not exists gpa_scale_bands_scale_idx on public.gpa_scale_bands (scale_id);

-- =============================================================================
-- Row Level Security. Every row is owned by exactly one user, and child rows are
-- additionally pinned to a parent that the same user owns, so a forged insert
-- cannot attach data under someone else's semester/course/scale.
-- =============================================================================

alter table public.academic_courses enable row level security;
alter table public.academic_items enable row level security;
alter table public.gpa_scales enable row level security;
alter table public.gpa_scale_bands enable row level security;

-- academic_courses -----------------------------------------------------------
drop policy if exists academic_courses_select on public.academic_courses;
create policy academic_courses_select on public.academic_courses
    for select using (auth.uid() = user_id);

drop policy if exists academic_courses_insert on public.academic_courses;
create policy academic_courses_insert on public.academic_courses
    for insert with check (
        auth.uid() = user_id
        and (
            semester_id is null
            or exists (
                select 1 from public.academic_semesters s
                where s.id = semester_id and s.user_id = auth.uid()
            )
        )
    );

drop policy if exists academic_courses_update on public.academic_courses;
create policy academic_courses_update on public.academic_courses
    for update using (auth.uid() = user_id)
    with check (
        auth.uid() = user_id
        and (
            semester_id is null
            or exists (
                select 1 from public.academic_semesters s
                where s.id = semester_id and s.user_id = auth.uid()
            )
        )
    );

drop policy if exists academic_courses_delete on public.academic_courses;
create policy academic_courses_delete on public.academic_courses
    for delete using (auth.uid() = user_id);

-- academic_items -------------------------------------------------------------
--
-- The insert/update policies below need to confirm that parent_id points at an
-- item of the same course belonging to the same user. That check cannot be an
-- inline subquery on academic_items: a policy that queries its own table is
-- re-evaluated by its own RLS, which Postgres reports as
-- "infinite recursion detected in policy for relation academic_items" and which
-- fails every query against the table. A security definer function runs as the
-- table owner and so bypasses RLS, breaking the cycle.
--
-- This also tightens the check: the parent must belong to the SAME course, not
-- merely to the same user, so nesting cannot cross between a user's own
-- courses.
create or replace function public.academic_item_parent_is_valid(
    p_parent_id uuid,
    p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.academic_items parent
        where parent.id = p_parent_id
          and parent.course_id = p_course_id
          and parent.user_id = auth.uid()
    );
$$;

revoke all on function public.academic_item_parent_is_valid(uuid, uuid) from public;
grant execute on function public.academic_item_parent_is_valid(uuid, uuid) to authenticated;

drop policy if exists academic_items_select on public.academic_items;
create policy academic_items_select on public.academic_items
    for select using (auth.uid() = user_id);

drop policy if exists academic_items_insert on public.academic_items;
create policy academic_items_insert on public.academic_items
    for insert with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.academic_courses c
            where c.id = course_id and c.user_id = auth.uid()
        )
        and (
            parent_id is null
            or public.academic_item_parent_is_valid(parent_id, course_id)
        )
    );

drop policy if exists academic_items_update on public.academic_items;
create policy academic_items_update on public.academic_items
    for update using (auth.uid() = user_id)
    with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.academic_courses c
            where c.id = course_id and c.user_id = auth.uid()
        )
        and (
            parent_id is null
            or public.academic_item_parent_is_valid(parent_id, course_id)
        )
    );

drop policy if exists academic_items_delete on public.academic_items;
create policy academic_items_delete on public.academic_items
    for delete using (auth.uid() = user_id);

-- gpa_scales -----------------------------------------------------------------
drop policy if exists gpa_scales_select on public.gpa_scales;
create policy gpa_scales_select on public.gpa_scales
    for select using (auth.uid() = user_id);

drop policy if exists gpa_scales_insert on public.gpa_scales;
create policy gpa_scales_insert on public.gpa_scales
    for insert with check (auth.uid() = user_id);

drop policy if exists gpa_scales_update on public.gpa_scales;
create policy gpa_scales_update on public.gpa_scales
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists gpa_scales_delete on public.gpa_scales;
create policy gpa_scales_delete on public.gpa_scales
    for delete using (auth.uid() = user_id);

-- gpa_scale_bands ------------------------------------------------------------
drop policy if exists gpa_scale_bands_select on public.gpa_scale_bands;
create policy gpa_scale_bands_select on public.gpa_scale_bands
    for select using (
        exists (
            select 1 from public.gpa_scales s
            where s.id = scale_id and s.user_id = auth.uid()
        )
    );

drop policy if exists gpa_scale_bands_insert on public.gpa_scale_bands;
create policy gpa_scale_bands_insert on public.gpa_scale_bands
    for insert with check (
        exists (
            select 1 from public.gpa_scales s
            where s.id = scale_id and s.user_id = auth.uid()
        )
    );

drop policy if exists gpa_scale_bands_update on public.gpa_scale_bands;
create policy gpa_scale_bands_update on public.gpa_scale_bands
    for update using (
        exists (
            select 1 from public.gpa_scales s
            where s.id = scale_id and s.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.gpa_scales s
            where s.id = scale_id and s.user_id = auth.uid()
        )
    );

drop policy if exists gpa_scale_bands_delete on public.gpa_scale_bands;
create policy gpa_scale_bands_delete on public.gpa_scale_bands
    for delete using (
        exists (
            select 1 from public.gpa_scales s
            where s.id = scale_id and s.user_id = auth.uid()
        )
    );
