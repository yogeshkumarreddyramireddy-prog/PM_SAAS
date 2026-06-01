-- Harden access control:
--  1. Default `approved` to false (the secure state) on the live DB.
--  2. Re-check approval + suspension in the client_golf_courses (multi-course)
--     branch of every geospatial/content RLS policy. Previously that branch only
--     checked cgc.is_active, so a suspended OR unapproved client who still had an
--     active client_golf_courses assignment could read tilesets, COGs, vector
--     layers, images, predictions, content_files and mapbox_configs for any
--     assigned course — the primary (multi-course) access path bypassed the gate.

-- 1. Secure default ------------------------------------------------------------
ALTER TABLE public.user_profiles ALTER COLUMN approved SET DEFAULT false;

-- 2. Helper: is this user an approved, non-suspended client (or admin)? --------
CREATE OR REPLACE FUNCTION public.is_client_in_good_standing(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = uid
      AND up.approved = true
      AND COALESCE(up.access_suspended, false) = false
  );
$$;

-- 3. Recreate policies with the hardened cgc branch ----------------------------

-- golf_course_tilesets
DROP POLICY IF EXISTS "Clients can view their golf course tilesets" ON public.golf_course_tilesets;
CREATE POLICY "Clients can view their golf course tilesets" ON public.golf_course_tilesets FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = golf_course_tilesets.golf_course_id)
    OR (public.is_client_in_good_standing(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = golf_course_tilesets.golf_course_id))
);

-- health_map_tilesets
DROP POLICY IF EXISTS "Clients can view their health map tilesets" ON public.health_map_tilesets;
CREATE POLICY "Clients can view their health map tilesets" ON public.health_map_tilesets FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = health_map_tilesets.golf_course_id)
    OR (public.is_client_in_good_standing(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = health_map_tilesets.golf_course_id))
);

-- vector_layers
DROP POLICY IF EXISTS "Clients can view their vector layers" ON public.vector_layers;
CREATE POLICY "Clients can view their vector layers" ON public.vector_layers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = vector_layers.golf_course_id)
    OR (public.is_client_in_good_standing(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = vector_layers.golf_course_id))
);

-- images (view)
DROP POLICY IF EXISTS "Clients can view their images" ON public.images;
CREATE POLICY "Clients can view their images" ON public.images FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = images.golf_course_id)
    OR (public.is_client_in_good_standing(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = images.golf_course_id))
);

-- images (insert)
DROP POLICY IF EXISTS "Clients can insert images" ON public.images;
CREATE POLICY "Clients can insert images" ON public.images FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = images.golf_course_id)
        OR (public.is_client_in_good_standing(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = images.golf_course_id))
    )
);

-- model_predictions
DROP POLICY IF EXISTS "Clients can view their model predictions" ON public.model_predictions;
CREATE POLICY "Clients can view their model predictions" ON public.model_predictions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = model_predictions.golf_course_id)
    OR (public.is_client_in_good_standing(auth.uid()) AND EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = model_predictions.golf_course_id))
);

-- content_files (originally hardened-but-incomplete in 20260427)
DROP POLICY IF EXISTS "Clients can view their golf course content" ON public.content_files;
CREATE POLICY "Clients can view their golf course content" ON public.content_files
  FOR SELECT USING (
    golf_course_id IN (
      SELECT golf_course_id FROM public.user_profiles
        WHERE id = auth.uid() AND approved = true AND access_suspended = false
      UNION
      SELECT golf_course_id FROM public.client_golf_courses
        WHERE client_id = auth.uid() AND is_active = true
          AND public.is_client_in_good_standing(auth.uid())
    )
  );

-- mapbox_configs (also add the missing access_suspended check on the primary branch)
DROP POLICY IF EXISTS "Users can view their mapbox config" ON public.mapbox_configs;
CREATE POLICY "Users can view their mapbox config" ON public.mapbox_configs
  FOR SELECT USING (
    golf_course_id IN (
      SELECT golf_course_id FROM public.user_profiles
        WHERE id = auth.uid() AND approved = true AND access_suspended = false
      UNION
      SELECT golf_course_id FROM public.client_golf_courses
        WHERE client_id = auth.uid() AND is_active = true
          AND public.is_client_in_good_standing(auth.uid())
    )
  );
