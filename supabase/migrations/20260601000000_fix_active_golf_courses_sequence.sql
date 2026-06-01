-- Fix: creating a golf course fails with "409 Conflict" (duplicate primary key).
--
-- Earlier data migrations (20260303000000_migrate_old_content.sql) inserted rows
-- into active_golf_courses with explicit id values. An explicit-id INSERT does
-- not advance the table's SERIAL sequence, so the sequence was left pointing at
-- an id that already exists. Every subsequent app INSERT (which omits id) then
-- tries to reuse a taken id and fails the primary-key uniqueness check -> 409.
--
-- Resync the sequence to MAX(id) so the next nextval() returns a fresh id.
-- Idempotent and safe to run on any environment.

SELECT setval(
  pg_get_serial_sequence('public.active_golf_courses', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM public.active_golf_courses)
);
