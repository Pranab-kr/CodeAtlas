-- Same predicate as the previous migration, with auth.jwt() itself inside the
-- subselect. This is the form the Supabase linter recognises as a single
-- evaluation per query rather than per row.

drop policy "projects_organization_access" on public.projects;
create policy "projects_organization_access" on public.projects
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "analyses_organization_access" on public.analyses;
create policy "analyses_organization_access" on public.analyses
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "files_organization_access" on public.files;
create policy "files_organization_access" on public.files
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "edges_organization_access" on public.edges;
create policy "edges_organization_access" on public.edges
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "routes_organization_access" on public.routes;
create policy "routes_organization_access" on public.routes
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "explanations_organization_access" on public.explanations;
create policy "explanations_organization_access" on public.explanations
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "file_roles_organization_access" on public.file_roles;
create policy "file_roles_organization_access" on public.file_roles
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "insights_organization_access" on public.insights;
create policy "insights_organization_access" on public.insights
  for all to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  )
  with check (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );
