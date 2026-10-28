-- Phase 2 schema. Every row belongs to a Clerk organization, and every table
-- carries organization_id directly. That keeps RLS to one predicate and makes
-- a child row that disagrees with its parent impossible: the composite foreign
-- keys below always include the organization.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  name text not null check (char_length(name) > 0),
  repository_url text not null check (char_length(repository_url) > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, repository_url),
  unique (id, organization_id)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  project_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  stage text,
  stage_message text,
  commit_sha text,
  framework text,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id),
  unique (id, organization_id),
  foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  analysis_id uuid not null,
  path text not null check (char_length(path) > 0),
  folder text not null,
  lines integer not null default 0 check (lines >= 0),
  content_hash text not null check (char_length(content_hash) > 0),
  unique (analysis_id, path),
  unique (id, analysis_id, organization_id),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind text not null check (kind in ('import', 'reexport', 'dynamic', 'require')),
  unique (analysis_id, source_file_id, target_file_id, kind),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  foreign key (source_file_id, analysis_id, organization_id)
    references public.files (id, analysis_id, organization_id) on delete cascade,
  foreign key (target_file_id, analysis_id, organization_id)
    references public.files (id, analysis_id, organization_id) on delete cascade
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null check (
    method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')
  ),
  path text not null check (char_length(path) > 0),
  unique (analysis_id, method, path),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  foreign key (file_id, analysis_id, organization_id)
    references public.files (id, analysis_id, organization_id) on delete cascade
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  analysis_id uuid not null,
  target_kind text not null check (target_kind in ('file', 'folder')),
  file_id uuid,
  folder_path text,
  content_hash text not null check (char_length(content_hash) > 0),
  prompt_version text not null check (char_length(prompt_version) > 0),
  model text not null check (char_length(model) > 0),
  body text not null,
  created_at timestamptz not null default now(),
  check (
    (target_kind = 'file' and file_id is not null and folder_path is null)
    or
    (target_kind = 'folder' and file_id is null and folder_path is not null)
  ),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  foreign key (file_id, analysis_id, organization_id)
    references public.files (id, analysis_id, organization_id) on delete cascade
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null check (char_length(role) > 0),
  source text not null check (source in ('adapter', 'ai')),
  unique (file_id),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade,
  foreign key (file_id, analysis_id, organization_id)
    references public.files (id, analysis_id, organization_id) on delete cascade
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) > 0),
  analysis_id uuid not null,
  kind text not null
    check (kind in ('cycle', 'unimported', 'high-fan-in', 'long-file')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (analysis_id, organization_id)
    references public.analyses (id, organization_id) on delete cascade
);

-- The organization comes first because every read is narrowed by the policy
-- before anything else is considered.
create index projects_organization_created_idx
  on public.projects (organization_id, created_at desc);
create index analyses_organization_updated_idx
  on public.analyses (organization_id, updated_at desc);
create index files_organization_analysis_idx
  on public.files (organization_id, analysis_id);
create index edges_organization_analysis_idx
  on public.edges (organization_id, analysis_id);
create index edges_source_file_idx on public.edges (source_file_id);
create index edges_target_file_idx on public.edges (target_file_id);
create index routes_organization_analysis_idx
  on public.routes (organization_id, analysis_id);
create index routes_file_idx on public.routes (file_id);
create index explanations_organization_analysis_idx
  on public.explanations (organization_id, analysis_id);
create index explanations_file_idx
  on public.explanations (file_id) where file_id is not null;
create index file_roles_organization_analysis_idx
  on public.file_roles (organization_id, analysis_id);
create index insights_organization_analysis_idx
  on public.insights (organization_id, analysis_id);

-- One explanation per target, content, prompt and model. The content hash is
-- what makes a cache entry stale when the file changes.
create unique index explanations_file_cache_idx
  on public.explanations (analysis_id, file_id, content_hash, prompt_version, model)
  where file_id is not null;
create unique index explanations_folder_cache_idx
  on public.explanations (analysis_id, folder_path, content_hash, prompt_version, model)
  where folder_path is not null;

alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

create policy "projects_organization_access" on public.projects
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "analyses_organization_access" on public.analyses
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "files_organization_access" on public.files
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "edges_organization_access" on public.edges
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "routes_organization_access" on public.routes
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "explanations_organization_access" on public.explanations
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "file_roles_organization_access" on public.file_roles
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy "insights_organization_access" on public.insights
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

-- No anonymous access. The signed-in Clerk token is the only way in, and the
-- policies above decide which rows it may touch.
revoke all on public.projects from anon;
revoke all on public.analyses from anon;
revoke all on public.files from anon;
revoke all on public.edges from anon;
revoke all on public.routes from anon;
revoke all on public.explanations from anon;
revoke all on public.file_roles from anon;
revoke all on public.insights from anon;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.analyses to authenticated;
grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.edges to authenticated;
grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.explanations to authenticated;
grant select, insert, update, delete on public.file_roles to authenticated;
grant select, insert, update, delete on public.insights to authenticated;
