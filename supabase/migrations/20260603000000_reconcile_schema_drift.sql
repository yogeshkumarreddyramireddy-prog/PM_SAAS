-- Reconcile schema drift: create objects that the app/edge functions reference
-- but that no migration ever created (they had been applied to the live DB by
-- hand, so a from-migrations rebuild was broken).

-- 1. annotations -------------------------------------------------------------
-- Used by src/lib/annotationService.ts (list/create/update/delete + GeoJSON /
-- shapefile import) via src/hooks/useDrawingManager.ts. Geometry is stored as
-- GeoJSON in a JSONB column (the app sends/reads plain GeoJSON objects through
-- PostgREST) — NOT a PostGIS geometry column. This is why useDrawingManager
-- strips the turf-added `bbox` member before writes.
CREATE TABLE IF NOT EXISTS public.annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  golf_course_id INTEGER NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
  plot_id TEXT,
  external_code TEXT,
  comment TEXT,
  annotation_type TEXT NOT NULL DEFAULT 'area' CHECK (annotation_type IN ('point', 'line', 'area', 'plot_grid')),
  geometry JSONB,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Defensive: the table was applied by hand on some environments and may be
-- missing columns the app uses. Add any that are absent (no-op if present).
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS golf_course_id INTEGER;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS plot_id TEXT;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS external_code TEXT;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS annotation_type TEXT;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS geometry JSONB;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.annotations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

CREATE INDEX IF NOT EXISTS annotations_golf_course_id_idx ON public.annotations(golf_course_id);

DROP TRIGGER IF EXISTS update_annotations_updated_at ON public.annotations;
CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON public.annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access" ON public.annotations;
CREATE POLICY "Admins have full access" ON public.annotations
  FOR ALL USING (public.is_user_admin_safe(auth.uid()));

-- Clients can read+write annotations for the courses they may access (legacy
-- golf_course_id OR active client_golf_courses assignment, in good standing).
DROP POLICY IF EXISTS "Clients can manage their course annotations" ON public.annotations;
CREATE POLICY "Clients can manage their course annotations" ON public.annotations
  FOR ALL USING (
    golf_course_id IN (
      SELECT golf_course_id FROM public.user_profiles
        WHERE id = auth.uid() AND approved = true AND access_suspended = false
      UNION
      SELECT golf_course_id FROM public.client_golf_courses
        WHERE client_id = auth.uid() AND is_active = true
          AND public.is_client_in_good_standing(auth.uid())
    )
  )
  WITH CHECK (
    golf_course_id IN (
      SELECT golf_course_id FROM public.user_profiles
        WHERE id = auth.uid() AND approved = true AND access_suspended = false
      UNION
      SELECT golf_course_id FROM public.client_golf_courses
        WHERE client_id = auth.uid() AND is_active = true
          AND public.is_client_in_good_standing(auth.uid())
    )
  );

-- 2. golf_course_tilesets.cog_source_key -------------------------------------
-- Written by supabase/functions/r2-complete-cog (the R2 key of the source COG),
-- read by r2-sign (COG access check) and ZonalStatsPanel / tilesetService.
ALTER TABLE public.golf_course_tilesets
  ADD COLUMN IF NOT EXISTS cog_source_key TEXT;
CREATE INDEX IF NOT EXISTS golf_course_tilesets_cog_source_key_idx
  ON public.golf_course_tilesets(cog_source_key);

-- 3. user_login_logs ---------------------------------------------------------
-- Written by useAuth.signIn on every login; read by AdminAnalytics. Column set
-- matches the generated types.ts (id, user_id, logged_in_at, ip_address,
-- user_agent, portal_type, metadata).
CREATE TABLE IF NOT EXISTS public.user_login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  logged_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  portal_type TEXT,
  metadata JSONB
);

-- Defensive: a hand-applied user_login_logs existed on staging WITHOUT the
-- logged_in_at column that AdminAnalytics orders by. Add any missing columns so
-- the table matches what the app/types expect (no-op if already present).
ALTER TABLE public.user_login_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.user_login_logs ADD COLUMN IF NOT EXISTS logged_in_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.user_login_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE public.user_login_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.user_login_logs ADD COLUMN IF NOT EXISTS portal_type TEXT;
ALTER TABLE public.user_login_logs ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS user_login_logs_user_id_idx ON public.user_login_logs(user_id);
CREATE INDEX IF NOT EXISTS user_login_logs_logged_in_at_idx ON public.user_login_logs(logged_in_at DESC);

ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own login record.
DROP POLICY IF EXISTS "Users can log their own logins" ON public.user_login_logs;
CREATE POLICY "Users can log their own logins" ON public.user_login_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins can read all login logs (analytics).
DROP POLICY IF EXISTS "Admins can view login logs" ON public.user_login_logs;
CREATE POLICY "Admins can view login logs" ON public.user_login_logs
  FOR SELECT USING (public.is_user_admin_safe(auth.uid()));
