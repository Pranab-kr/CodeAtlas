-- Pre-deployment hardening. Apply the same least-privilege grants already used
-- on public.explanations to the remaining public tables.
--
-- Supabase's default privileges leave TRUNCATE, REFERENCES, and TRIGGER on
-- public tables for authenticated, and TRUNCATE bypasses row-level security.
-- Every write in the app uses the service-role pipeline client except project
-- deletion, which runs as the signed-in user under RLS and cascades to child
-- tables via table-owner referential integrity triggers.

revoke all on public.projects from authenticated;
revoke all on public.analyses from authenticated;
revoke all on public.files from authenticated;
revoke all on public.edges from authenticated;
revoke all on public.routes from authenticated;
revoke all on public.file_roles from authenticated;
revoke all on public.insights from authenticated;

grant select, delete on public.projects to authenticated;
grant select on public.analyses to authenticated;
grant select on public.files to authenticated;
grant select on public.edges to authenticated;
grant select on public.routes to authenticated;
grant select on public.file_roles to authenticated;
grant select on public.insights to authenticated;

-- Narrow RLS policies to match the granted operations while keeping the exact
-- initplan (select auth.jwt()) predicate and Clerk o.id / org_id fallback.

drop policy "projects_organization_access" on public.projects;
create policy "projects_organization_read" on public.projects
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );
create policy "projects_organization_delete" on public.projects
  for delete to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "analyses_organization_access" on public.analyses;
create policy "analyses_organization_read" on public.analyses
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "files_organization_access" on public.files;
create policy "files_organization_read" on public.files
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "edges_organization_access" on public.edges;
create policy "edges_organization_read" on public.edges
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "routes_organization_access" on public.routes;
create policy "routes_organization_read" on public.routes
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "file_roles_organization_access" on public.file_roles;
create policy "file_roles_organization_read" on public.file_roles
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );

drop policy "insights_organization_access" on public.insights;
create policy "insights_organization_read" on public.insights
  for select to authenticated
  using (
    organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    )
  );
