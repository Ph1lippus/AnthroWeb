-- =============================================================================
-- Fix: "infinite recursion detected in policy for relation academic_items".
--
-- 0001 gave academic_items an insert/update policy that confirmed parent_id by
-- querying academic_items itself. Postgres applies a table's RLS whenever that
-- table is queried, so the policy re-entered itself and every statement against
-- academic_items failed - reads included, which is why the grading page went
-- blank rather than just refusing writes.
--
-- The parent check now lives in a security definer function, which executes as
-- the table owner and bypasses RLS, so the cycle is broken.
--
-- Safe to re-run.
-- =============================================================================

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

-- Recreated because the old definitions are the ones that recurse.
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