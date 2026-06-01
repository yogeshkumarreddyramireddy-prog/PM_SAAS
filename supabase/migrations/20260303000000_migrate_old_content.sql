-- Migration to copy old courses and content files
-- Add all active golf courses
INSERT INTO public.active_golf_courses (id, name, location, max_users, signup_enabled, created_at, updated_at, all_golf_course_id)
            VALUES (5, 'Worlds Best Golf Club', NULL, 5, true, '2025-07-16 14:20:24.642242+00', '2025-07-16 14:20:24.642242+00', NULL)
            ON CONFLICT (id) DO NOTHING;
INSERT INTO public.active_golf_courses (id, name, location, max_users, signup_enabled, created_at, updated_at, all_golf_course_id)
            VALUES (6, 'Golfbaan Zeegersloot', 'ALPHEN AAN DEN RIJN', 5, true, '2025-07-16 15:17:48.182447+00', '2025-07-16 15:17:48.182447+00', NULL)
            ON CONFLICT (id) DO NOTHING;
INSERT INTO public.active_golf_courses (id, name, location, max_users, signup_enabled, created_at, updated_at, all_golf_course_id)
            VALUES (7, 'Best Golf', NULL, 5, true, '2025-07-16 19:23:37.8997+00', '2025-07-16 19:23:37.8997+00', NULL)
            ON CONFLICT (id) DO NOTHING;
INSERT INTO public.active_golf_courses (id, name, location, max_users, signup_enabled, created_at, updated_at, all_golf_course_id)
            VALUES (9, 'Sallandsche Golfclub', NULL, 5, true, '2025-07-27 17:28:45.368986+00', '2025-07-27 17:28:45.368986+00', NULL)
            ON CONFLICT (id) DO NOTHING;
INSERT INTO public.active_golf_courses (id, name, location, max_users, signup_enabled, created_at, updated_at, all_golf_course_id)
            VALUES (10, 'Het Woold', NULL, 5, true, '2025-08-12 07:20:21.46361+00', '2025-08-12 07:20:21.46361+00', NULL)
            ON CONFLICT (id) DO NOTHING;

-- The inserts above use explicit id values, which does NOT advance the SERIAL
-- sequence. Without this resync the sequence still points at an already-used id,
-- so the next app-driven INSERT (which omits id) collides on the primary key and
-- fails with a 409 Conflict. Bump the sequence past the highest existing id.
SELECT setval(
  pg_get_serial_sequence('public.active_golf_courses', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM public.active_golf_courses)
);

-- Add content files

-- Ensure client@123.com is approved and assigned a course
UPDATE public.user_profiles 
SET approved = true, golf_course_id = 6
WHERE email = 'client@123.com';

-- Ensure all users created get backfilled properly and approved (for ease of dev context)
UPDATE public.user_profiles SET approved = true WHERE role = 'client';
