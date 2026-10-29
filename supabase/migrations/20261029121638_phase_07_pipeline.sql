-- Phase 7. A run stores the parser's output, and the map is read back from
-- these rows. The two edge columns are what the parser already produced; the
-- phase 2 schema kept only the resolved endpoints.

alter table public.analyses
  add column coverage jsonb;

alter table public.analyses
  add constraint analyses_stage_check
  check (stage is null or stage in ('fetch', 'select', 'parse', 'store'));

-- No rows predate this migration, so the columns can be required without
-- inventing values for them.
alter table public.edges
  add column specifier text not null,
  add column line integer not null;

-- Path-keyed edge insert. The browser never calls this; the pipeline writes
-- with the secret key, and the function refuses the whole chunk if an edge
-- names a file the run did not store. Paths are what the parser produces;
-- resolving them to ids is the database's job.
create function public.insert_edges(p_analysis_id uuid, p_edges jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  expected integer := jsonb_array_length(p_edges);
  inserted integer;
begin
  insert into public.edges
    (organization_id, analysis_id, source_file_id, target_file_id, kind, specifier, line)
  select
    s.organization_id,
    p_analysis_id,
    s.id,
    t.id,
    edge.kind,
    edge.specifier,
    edge.line
  from jsonb_to_recordset(p_edges)
    as edge (source text, target text, kind text, specifier text, line integer)
  join public.files s
    on s.analysis_id = p_analysis_id and s.path = edge.source
  join public.files t
    on t.analysis_id = p_analysis_id and t.path = edge.target;

  get diagnostics inserted = row_count;
  if inserted <> expected then
    raise exception
      'insert_edges: % of % edges matched stored files for analysis %',
      inserted, expected, p_analysis_id;
  end if;
  return inserted;
end;
$$;

revoke execute on function public.insert_edges(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_edges(uuid, jsonb) to service_role;

-- Live progress. Each analysis has a private broadcast channel,
-- "analysis:<id>". The pattern is declared here, before anything publishes to
-- it: without a select policy on realtime.messages the broadcast is accepted
-- and delivered to nobody, silently. The subquery on analyses runs under that
-- table's own policy, so another organization's topic matches no row and the
-- join is refused, exactly as its rows aren't selectable.
create policy "members receive their organization's analysis progress"
  on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.analyses a
      where 'analysis:' || a.id::text = (select realtime.topic())
    )
  );

-- No insert policy: browsers listen on these channels and never send. Only the
-- trigger below publishes.

-- The stage and its message, not the row. On failure the message is the
-- reason, so the page shows what arrived without interpreting it. Security
-- definer because publishing is the database's act, not the writer's.
create function public.publish_analysis_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'status', new.status,
      'stage', new.stage,
      'message', case when new.status = 'failed' then new.error else new.stage_message end
    ),
    'progress',
    'analysis:' || new.id::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.publish_analysis_progress()
  from public, anon, authenticated;

-- On our own table, never on the realtime machinery.
create trigger publish_progress
  after update of status, stage, stage_message, error on public.analyses
  for each row
  when (
    old.status is distinct from new.status
    or old.stage is distinct from new.stage
    or old.stage_message is distinct from new.stage_message
  )
  execute function public.publish_analysis_progress();
