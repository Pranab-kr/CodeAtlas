-- Phase 10 follow-up. The explanations read policy must accept the same
-- organization claim as every other table. Clerk's default session token
-- carries the active organization as the compact `o.id` claim; `org_id` is
-- only the older shape.

drop policy "explanations_organization_read" on public.explanations;

create policy "explanations_organization_read" on public.explanations
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );
