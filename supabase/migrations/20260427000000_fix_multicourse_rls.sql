-- Fix RLS policies so multi-course clients (via client_golf_courses) can access
-- content_files and mapbox_configs for all their assigned courses, not just
-- the primary golf_course_id on their user_profiles row.

-- content_files
DROP POLICY IF EXISTS "Clients can view their golf course content" ON public.content_files;
CREATE POLICY "Clients can view their golf course content" ON public.content_files
  FOR SELECT USING (
    golf_course_id IN (
      SELECT golf_course_id FROM public.user_profiles
        WHERE id = auth.uid() AND approved = true AND access_suspended = false
      UNION
      SELECT golf_course_id FROM public.client_golf_courses
        WHERE client_id = auth.uid() AND is_active = true
    )
  );

-- mapbox_configs
DROP POLICY IF EXISTS "Users can view their mapbox config" ON public.mapbox_configs;
CREATE POLICY "Users can view their mapbox config" ON public.mapbox_configs
  FOR SELECT USING (
    golf_course_id IN (
      SELECT golf_course_id FROM public.user_profiles
        WHERE id = auth.uid() AND approved = true
      UNION
      SELECT golf_course_id FROM public.client_golf_courses
        WHERE client_id = auth.uid() AND is_active = true
    )
  );
