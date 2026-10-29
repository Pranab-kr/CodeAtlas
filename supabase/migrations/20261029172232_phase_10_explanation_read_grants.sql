-- Phase 10 follow-up. Supabase's default grants left TRUNCATE, REFERENCES
-- and TRIGGER on the table, and TRUNCATE bypasses row policies. Members get
-- reads only; the server action writes with the pipeline's secret key.

revoke all on public.explanations from authenticated;
grant select on public.explanations to authenticated;
