-- Phase 10. The explanations table already carries the cache key; this adds
-- the label stage a run passes through and lets a stored role say whether
-- convention or the model assigned it.

alter table public.analyses
  drop constraint analyses_stage_check,
  add constraint analyses_stage_check
  check (stage is null or stage in ('fetch', 'select', 'parse', 'label', 'store'));

-- Roles now carry their source. A caller that omits it still writes an
-- adapter role, so the old call shape keeps working.
create or replace function public.insert_file_roles(p_analysis_id uuid, p_roles jsonb)
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
    coalesce(r.source, 'adapter')
  from jsonb_to_recordset(p_roles)
    as r (path text, role text, source text)
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
