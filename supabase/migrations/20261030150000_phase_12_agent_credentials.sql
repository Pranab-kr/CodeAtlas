-- Phase 12. The agent's tools read one analysis without a signed-in user of
-- their own. The credential is a short-lived HMAC token naming one analysis
-- and its organization. It is minted and verified inside the database, so the
-- tools surface needs only the publishable key and never holds a key that can
-- read every row.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- One random key, generated here and never leaving the database. No policy
-- exists on the table, so only the defining functions below can read it.
create table if not exists private.agent_signing_secret (
  only_row boolean primary key default true check (only_row),
  secret bytea not null
);

alter table private.agent_signing_secret enable row level security;
revoke all on table private.agent_signing_secret
  from public, anon, authenticated;

insert into private.agent_signing_secret (secret)
select extensions.gen_random_bytes(32)
where not exists (select 1 from private.agent_signing_secret);

-- JWT base64url, without padding. PostgreSQL's base64 encoder wraps at 76
-- characters, so the newlines go before the URL alphabet is substituted.
create or replace function private.base64url_encode(p_data bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  select rtrim(
    translate(replace(encode(p_data, 'base64'), E'\n', ''), '+/', '-_'),
    '='
  );
$$;

create or replace function private.base64url_decode(p_text text)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base64 text;
begin
  v_base64 := translate(p_text, '-_', '+/');
  v_base64 := v_base64 || repeat('=', (4 - (length(v_base64) % 4)) % 4);
  return decode(v_base64, 'base64');
exception
  when others then
    return null;
end;
$$;

create or replace function private.agent_signing_key()
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select secret from private.agent_signing_secret limit 1;
$$;

revoke all on function private.base64url_encode(bytea)
  from public, anon, authenticated;
revoke all on function private.base64url_decode(text)
  from public, anon, authenticated;
revoke all on function private.agent_signing_key()
  from public, anon, authenticated;

-- The one place a token is built. Ten minutes is longer than one run and
-- shorter than a session; every message mints a fresh one.
create or replace function private.agent_sign_credential(
  p_analysis_id uuid,
  p_organization_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_header text;
  v_payload text;
  v_signing_input text;
  v_signature text;
begin
  v_header := private.base64url_encode(
    convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8')
  );
  v_payload := private.base64url_encode(
    convert_to(
      jsonb_build_object(
        'analysis_id', p_analysis_id,
        'org_id', p_organization_id,
        'exp', floor(extract(epoch from now()))::bigint + 600
      )::text,
      'UTF8'
    )
  );
  v_signing_input := v_header || '.' || v_payload;
  v_signature := private.base64url_encode(
    extensions.hmac(
      convert_to(v_signing_input, 'UTF8'),
      private.agent_signing_key(),
      'sha256'
    )
  );
  return v_signing_input || '.' || v_signature;
end;
$$;

revoke all on function private.agent_sign_credential(uuid, text)
  from public, anon, authenticated;

-- Called by the signed-in server action. The organization comes from the
-- caller's token, so an analysis in another organization cannot be named.
create or replace function public.agent_mint_credential(p_analysis_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id text;
begin
  select a.organization_id
    into v_organization_id
  from public.analyses a
  where a.id = p_analysis_id
    and a.status = 'succeeded'
    and a.organization_id = coalesce(
      (select auth.jwt()) ->> 'org_id',
      (select auth.jwt()) -> 'o' ->> 'id'
    );

  if v_organization_id is null then
    raise exception
      'No finished analysis with that id is available in this organization.'
      using errcode = '42501';
  end if;

  return private.agent_sign_credential(p_analysis_id, v_organization_id);
end;
$$;

revoke all on function public.agent_mint_credential(uuid)
  from public, anon;
grant execute on function public.agent_mint_credential(uuid)
  to authenticated;

-- The evaluation needs a token without a browser session. The service key is
-- already the evaluator's, and this function is not reachable by the agent or
-- by a signed-in user.
create or replace function public.agent_mint_credential_for_service(
  p_analysis_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id text;
begin
  select a.organization_id
    into v_organization_id
  from public.analyses a
  where a.id = p_analysis_id
    and a.status = 'succeeded';

  if v_organization_id is null then
    raise exception 'No finished analysis with that id.'
      using errcode = '42501';
  end if;

  return private.agent_sign_credential(p_analysis_id, v_organization_id);
end;
$$;

revoke all on function public.agent_mint_credential_for_service(uuid)
  from public, anon, authenticated;
grant execute on function public.agent_mint_credential_for_service(uuid)
  to service_role;

-- The read side. A valid token is the only authorization; the function then
-- narrows every row to the analysis and organization it names. It returns the
-- stored map, not answers: the graph functions that draw the canvas run in
-- the application over this.
create or replace function public.agent_read_analysis(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_expected bytea;
  v_given bytea;
  v_payload jsonb;
  v_analysis_id uuid;
  v_organization_id text;
  v_expires_at bigint;
  v_analysis jsonb;
begin
  if p_token is null or length(p_token) > 4096 then
    raise exception 'The analysis credential is missing.'
      using errcode = '42501';
  end if;

  v_parts := string_to_array(p_token, '.');
  if coalesce(array_length(v_parts, 1), 0) <> 3 then
    raise exception 'The analysis credential is not valid.'
      using errcode = '42501';
  end if;

  v_expected := extensions.hmac(
    convert_to(v_parts[1] || '.' || v_parts[2], 'UTF8'),
    private.agent_signing_key(),
    'sha256'
  );
  v_given := private.base64url_decode(v_parts[3]);
  if v_given is null or v_given <> v_expected then
    raise exception 'The analysis credential is not valid.'
      using errcode = '42501';
  end if;

  v_payload := convert_from(
    private.base64url_decode(v_parts[2]),
    'UTF8'
  )::jsonb;
  v_expires_at := coalesce((v_payload ->> 'exp')::bigint, 0);

  if v_expires_at <= floor(extract(epoch from now()))::bigint then
    raise exception 'The analysis credential has expired.'
      using errcode = '42501';
  end if;

  v_analysis_id := (v_payload ->> 'analysis_id')::uuid;
  v_organization_id := v_payload ->> 'org_id';

  if v_analysis_id is null
    or v_organization_id is null
    or char_length(v_organization_id) = 0 then
    raise exception 'The analysis credential does not name an analysis.'
      using errcode = '42501';
  end if;

  select to_jsonb(a) - 'organization_id'
    into v_analysis
  from public.analyses a
  where a.id = v_analysis_id
    and a.organization_id = v_organization_id
    and a.status = 'succeeded';

  if v_analysis is null then
    raise exception 'That analysis is not available.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'analysis', v_analysis,
    'project', (
      select jsonb_build_object(
        'name', p.name,
        'repository_url', p.repository_url
      )
      from public.projects p
      where p.id = (v_analysis ->> 'project_id')::uuid
        and p.organization_id = v_organization_id
    ),
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) - 'organization_id' order by f.path)
      from public.files f
      where f.analysis_id = v_analysis_id
        and f.organization_id = v_organization_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(e) - 'organization_id' order by e.id)
      from public.edges e
      where e.analysis_id = v_analysis_id
        and e.organization_id = v_organization_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) - 'organization_id' order by r.id)
      from public.routes r
      where r.analysis_id = v_analysis_id
        and r.organization_id = v_organization_id
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_object('file_id', fr.file_id, 'role', fr.role)
        order by fr.file_id
      )
      from public.file_roles fr
      where fr.analysis_id = v_analysis_id
        and fr.organization_id = v_organization_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.agent_read_analysis(text) from public;
grant execute on function public.agent_read_analysis(text)
  to anon, authenticated, service_role;
