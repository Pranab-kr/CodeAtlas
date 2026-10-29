-- Phase 9. The names each parsed file exports, ESM and CommonJS alike, read
-- from the file's own syntax. A file stored by an older parser stays null, so
-- the pane can say exports weren't recorded rather than claim it exports
-- nothing. Every row written from now on carries a list, possibly empty.
alter table public.files
  add column exports text[];
