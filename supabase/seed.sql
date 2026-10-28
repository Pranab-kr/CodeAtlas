-- Development seed. These are the two Clerk organizations on the dev
-- instance. Replace the ids if the Clerk instance is recreated; the seed is
-- meant to demonstrate that one query returns different rows per workspace.

insert into public.projects (id, organization_id, name, repository_url)
values
  ('a1000000-0000-4000-8000-000000000001', 'org_3LKtj4waMCyezekza5kxyiNgl7S',
   'vercel/next.js', 'https://github.com/vercel/next.js'),
  ('a1000000-0000-4000-8000-000000000002', 'org_3LKtj4waMCyezekza5kxyiNgl7S',
   'nestjs/nest', 'https://github.com/nestjs/nest'),
  ('a1000000-0000-4000-8000-000000000003', 'org_3LKtj4waMCyezekza5kxyiNgl7S',
   'expressjs/express', 'https://github.com/expressjs/express'),
  ('b1000000-0000-4000-8000-000000000001', 'org_3LKtj6fO173mAsvbBBYO0nlalmF',
   'shadcn-ui/ui', 'https://github.com/shadcn-ui/ui'),
  ('b1000000-0000-4000-8000-000000000002', 'org_3LKtj6fO173mAsvbBBYO0nlalmF',
   'tailwindlabs/tailwindcss', 'https://github.com/tailwindlabs/tailwindcss')
on conflict (organization_id, repository_url) do nothing;

insert into public.analyses (
  id, organization_id, project_id, status, stage, stage_message, framework,
  error, started_at, finished_at, created_at, updated_at
)
values
  ('a2000000-0000-4000-8000-000000000001', 'org_3LKtj4waMCyezekza5kxyiNgl7S',
   'a1000000-0000-4000-8000-000000000001', 'succeeded', 'store',
   'Stored 2,431 files', 'nextjs', null,
   now() - interval '34 minutes', now() - interval '31 minutes',
   now() - interval '34 minutes', now() - interval '31 minutes'),
  ('a2000000-0000-4000-8000-000000000002', 'org_3LKtj4waMCyezekza5kxyiNgl7S',
   'a1000000-0000-4000-8000-000000000002', 'running', 'parse',
   'Parsing 1,204 files', 'nestjs', null,
   now() - interval '6 minutes', null,
   now() - interval '6 minutes', now() - interval '2 minutes'),
  ('a2000000-0000-4000-8000-000000000003', 'org_3LKtj4waMCyezekza5kxyiNgl7S',
   'a1000000-0000-4000-8000-000000000003', 'failed', 'fetch',
   'Fetching archive', null,
   'Repository archive could not be downloaded: 404 Not Found.',
   now() - interval '2 days', now() - interval '2 days',
   now() - interval '2 days', now() - interval '2 days'),
  ('b2000000-0000-4000-8000-000000000001', 'org_3LKtj6fO173mAsvbBBYO0nlalmF',
   'b1000000-0000-4000-8000-000000000001', 'succeeded', 'store',
   'Stored 418 files', 'nextjs', null,
   now() - interval '5 hours', now() - interval '5 hours',
   now() - interval '5 hours', now() - interval '5 hours'),
  ('b2000000-0000-4000-8000-000000000002', 'org_3LKtj6fO173mAsvbBBYO0nlalmF',
   'b1000000-0000-4000-8000-000000000002', 'queued', null, null,
   'nextjs', null, null, null,
   now() - interval '11 minutes', now() - interval '11 minutes')
on conflict (project_id) do nothing;
