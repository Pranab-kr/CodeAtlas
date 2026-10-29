-- Phase 8. Every file's role from convention, and every route whose method and
-- full pattern the syntax states.

-- Nothing has written a route yet, so the line can be required without
-- inventing a value for existing rows.
alter table public.routes
  add column line integer not null;

-- A route is now a declaration, not a URL. Two files may declare the same
-- method and pattern; the table shows both rather than dropping one. The old
-- key said the URL was unique across the analysis, which would abort the
-- whole insert instead.
alter table public.routes
  drop constraint routes_analysis_id_method_path_key,
  add constraint routes_declaration_key
    unique (analysis_id, file_id, method, path);

-- Both arrive keyed by path and resolve against the files the run stored. A
-- row that doesn't match aborts the call rather than being dropped.
create function public.insert_routes(p_analysis_id uuid, p_routes jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  expected integer := jsonb_array_length(p_routes);
  inserted integer;
begin
  insert into public.routes
    (organization_id, analysis_id, file_id, method, path, line)
  select
    f.organization_id,
    p_analysis_id,
    f.id,
    route.method,
    route.pattern,
    route.line
  from jsonb_to_recordset(p_routes)
    as route (file text, method text, pattern text, line integer)
  join public.files f
    on f.analysis_id = p_analysis_id and f.path = route.file;

  get diagnostics inserted = row_count;
  if inserted <> expected then
    raise exception
      'insert_routes: % of % routes matched stored files for analysis %',
      inserted, expected, p_analysis_id;
  end if;
  return inserted;
end;
$$;

create function public.insert_file_roles(p_analysis_id uuid, p_roles jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  expected integer := jsonb_array_length(p_roles);
  inserted integer;
begin
  insert into public.file_roles
    (organization_id, analysis_id, file_id, role, source)
  select
    f.organization_id,
    p_analysis_id,
    f.id,
    r.role,
    'adapter'
  from jsonb_to_recordset(p_roles) as r (path text, role text)
  join public.files f
    on f.analysis_id = p_analysis_id and f.path = r.path;

  get diagnostics inserted = row_count;
  if inserted <> expected then
    raise exception
      'insert_file_roles: % of % roles matched stored files for analysis %',
      inserted, expected, p_analysis_id;
  end if;
  return inserted;
end;
$$;

-- Only the pipeline's writer calls these.
revoke execute on function public.insert_routes(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_routes(uuid, jsonb) to service_role;
revoke execute on function public.insert_file_roles(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_file_roles(uuid, jsonb) to service_role;
