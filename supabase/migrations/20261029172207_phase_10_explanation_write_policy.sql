-- Phase 10 follow-up. Explanations are written by the server action with the
-- pipeline's secret key and read by members through the policy. A cache entry
-- written by a browser would be indistinguishable from a model answer, so
-- members lose the write grants.

drop policy "explanations_organization_access" on public.explanations;

create policy "explanations_organization_read" on public.explanations
  for select to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'));

revoke insert, update, delete on public.explanations from authenticated;
