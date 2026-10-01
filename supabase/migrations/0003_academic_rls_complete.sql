-- =============================================================================
-- Complete RLS for the academic tables.
--
-- This is the single script that finishes the academic page's security model. It
-- does two things:
--
--   1. Fixes "infinite recursion detected in policy for relation
--      academic_items" by moving the parent_id ownership check into a security
--      definer function. (Migration 0002 does this on its own; it is repeated
--      here so this one script is sufficient on its own. Both are idempotent, so
--      running either or both is harmless.)
--
--   2. Enables RLS on the legacy academic tables, which sql.sql creates with no
--      policies at all. Filtering by user_id in the client is not a security
--      boundary: without RLS any authenticated user can read, change or delete
--      another user's rows through the Supabase API.
--
-- The legacy tables this covers are the academic family the page actually reads
-- and writes. It deliberately does NOT touch projects, habits, notes, workout
-- tables and the rest: those have their own access patterns (shared plans, log
-- rows referencing other tables) and want a separate, reviewed migration.
--
-- Safe to re-run: every statement is IF NOT EXISTS or drops the policy first.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Break the academic_items policy recursion
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 2. RLS for the legacy academic tables that carry only user_id
--
-- academic_semesters, grading_scales and study_sessions have no parent columns,
-- so ownership is the whole rule. Generated in a loop because the four policies
-- are identical for each and would otherwise be 12 copy-pasted blocks.
--
-- This is a DO block, not a helper function, on purpose: a helper would have to
-- be SECURITY DEFINER to alter tables, which would hand table-altering rights to
-- anyone who could call it. A DO block runs as the role executing this script.
-- -----------------------------------------------------------------------------

do $$
declare
    owned_only text[] := array['academic_semesters', 'grading_scales', 'study_sessions'];
    table_name text;
begin
    foreach table_name in array owned_only loop
        execute format('alter table public.%I enable row level security', table_name);

        execute format('drop policy if exists %I on public.%I', table_name || '_select', table_name);
        execute format(
            'create policy %I on public.%I for select using (auth.uid() = user_id)',
            table_name || '_select', table_name
        );

        execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
        execute format(
            'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
            table_name || '_insert', table_name
        );

        execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
        execute format(
            'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
            table_name || '_update', table_name
        );

        execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);
        execute format(
            'create policy %I on public.%I for delete using (auth.uid() = user_id)',
            table_name || '_delete', table_name
        );
    end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. RLS for the legacy tables that reference another user's rows
--
-- academic_grades, academic_goals and academic_assessments all carry semester_id,
-- and academic_grades also carries grading_scale_id. Ownership alone is not
-- enough: a user could otherwise insert a row pointing at someone else's
-- semester and have it appear in that semester's listing.
--
-- These lookups query academic_semesters and grading_scales, whose policies are
-- the flat `auth.uid() = user_id` above. They do not reference back, so there is
-- no policy recursion here.
-- -----------------------------------------------------------------------------

drop policy if exists academic_grades_select on public.academic_grades;
create policy academic_grades_select on public.academic_grades
    for select using (auth.uid() = user_id);

drop policy if exists academic_grades_insert on public.academic_grades;
create policy academic_grades_insert on public.academic_grades
    for insert with check (
        auth.uid() = user_id
        and (
            semester_id is null
            or exists (
                select 1 from public.academic_semesters s
                where s.id = semester_id and s.user_id = auth.uid()
            )
        )
        and (
            grading_scale_id is null
            or exists (
                select 1 from public.grading_scales g
                where g.id = grading_scale_id and g.user_id = auth.uid()
            )
        )
    );

drop policy if exists academic_grades_update on public.academic_grades;
create policy academic_grades_update on public.academic_grades
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
        and (
            grading_scale_id is null
            or exists (
                select 1 from public.grading_scales g
                where g.id = grading_scale_id and g.user_id = auth.uid()
            )
        )
    );

drop policy if exists academic_grades_delete on public.academic_grades;
create policy academic_grades_delete on public.academic_grades
    for delete using (auth.uid() = user_id);

drop policy if exists academic_goals_select on public.academic_goals;
create policy academic_goals_select on public.academic_goals
    for select using (auth.uid() = user_id);

drop policy if exists academic_goals_insert on public.academic_goals;
create policy academic_goals_insert on public.academic_goals
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

drop policy if exists academic_goals_update on public.academic_goals;
create policy academic_goals_update on public.academic_goals
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

drop policy if exists academic_goals_delete on public.academic_goals;
create policy academic_goals_delete on public.academic_goals
    for delete using (auth.uid() = user_id);

drop policy if exists academic_assessments_select on public.academic_assessments;
create policy academic_assessments_select on public.academic_assessments
    for select using (auth.uid() = user_id);

drop policy if exists academic_assessments_insert on public.academic_assessments;
create policy academic_assessments_insert on public.academic_assessments
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

drop policy if exists academic_assessments_update on public.academic_assessments;
create policy academic_assessments_update on public.academic_assessments
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

drop policy if exists academic_assessments_delete on public.academic_assessments;
create policy academic_assessments_delete on public.academic_assessments
    for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. user_settings holds a single profile row per account, so the unique index
--    on user_id is what stops one person claiming another's slot. RLS plus that
--    index means an update can only ever touch your own row.
-- -----------------------------------------------------------------------------

alter table public.user_settings enable row level security;

drop policy if exists user_settings_select on public.user_settings;
create policy user_settings_select on public.user_settings
    for select using (auth.uid() = user_id);

drop policy if exists user_settings_insert on public.user_settings;
create policy user_settings_insert on public.user_settings
    for insert with check (auth.uid() = user_id);

drop policy if exists user_settings_update on public.user_settings;
create policy user_settings_update on public.user_settings
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_settings_delete on public.user_settings;
create policy user_settings_delete on public.user_settings
    for delete using (auth.uid() = user_id);