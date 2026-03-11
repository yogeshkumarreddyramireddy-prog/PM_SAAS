-- ==========================================================================
-- BASE PHYTOMAP VISTA SCHEMA
-- Creates all foundation tables, functions, RLS policies, and seed data
-- that the ML merge migration (20260301) depends on.
-- ==========================================================================

-- ========================
-- 1. UTILITY FUNCTIONS
-- ========================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================
-- 2. CORE TABLES
-- ========================

-- All Golf Courses (master list)
CREATE TABLE IF NOT EXISTS public.all_golf_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  postcode TEXT,
  city TEXT
);

-- Active Golf Courses (courses currently served by the platform)
CREATE TABLE IF NOT EXISTS public.active_golf_courses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  max_users INTEGER DEFAULT 5,
  signup_enabled BOOLEAN DEFAULT true,
  all_golf_course_id UUID REFERENCES public.all_golf_courses(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TRIGGER update_active_golf_courses_updated_at
  BEFORE UPDATE ON public.active_golf_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User Profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  full_name TEXT,
  golf_course_id INTEGER REFERENCES public.active_golf_courses(id),
  golf_course_name TEXT,
  approved BOOLEAN NOT NULL DEFAULT true,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  request_reason TEXT,
  access_suspended BOOLEAN DEFAULT false,
  suspension_reason TEXT,
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspended_by UUID REFERENCES auth.users(id),
  access_request_pending BOOLEAN DEFAULT false,
  access_request_message TEXT,
  access_requested_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================
-- 3. CONTENT TABLES
-- ========================

-- Content Categories
CREATE TABLE IF NOT EXISTS public.content_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- File category enum
DO $$ BEGIN
  CREATE TYPE public.file_category_type AS ENUM ('live_maps', 'reports', 'hd_maps', '3d_models');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Content Files
CREATE TABLE IF NOT EXISTS public.content_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  golf_course_id INTEGER REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES public.content_categories(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'published', 'archived')),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  r2_object_key TEXT,
  r2_bucket_name TEXT DEFAULT 'pmv-files',
  file_category public.file_category_type,
  original_filename TEXT,
  file_extension TEXT,
  file_hash TEXT,
  upload_progress INTEGER DEFAULT 100,
  thumbnail_path TEXT,
  preview_url TEXT,
  download_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  gps_coordinates POINT,
  map_bounds JSONB,
  zoom_levels INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6,7,8,9,10],
  mapbox_layer_id TEXT,
  is_mapbox_overlay BOOLEAN DEFAULT false,
  "fieldId" public.file_category_type,
  tile_map_id TEXT,
  tile_base_url TEXT,
  tile_min_zoom INTEGER DEFAULT 0,
  tile_max_zoom INTEGER DEFAULT 18,
  is_tile_map BOOLEAN DEFAULT false
);

CREATE TRIGGER update_content_files_updated_at
  BEFORE UPDATE ON public.content_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Access Requests
CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('restore_access', 'initial_access')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- File Access Logs
CREATE TABLE IF NOT EXISTS public.file_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.content_files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id),
  access_type TEXT NOT NULL,
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Mapbox Configs
CREATE TABLE IF NOT EXISTS public.mapbox_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  golf_course_id INTEGER REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  style_url TEXT DEFAULT 'mapbox://styles/mapbox/satellite-v9',
  default_center POINT,
  default_zoom INTEGER DEFAULT 15,
  bounds JSONB,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Auth Security Settings (documentation table)
CREATE TABLE IF NOT EXISTS public.auth_security_settings_documentation (
  setting_name TEXT PRIMARY KEY,
  recommended_value TEXT,
  current_status TEXT,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ========================
-- 4. SECURITY DEFINER FUNCTIONS (for RLS)
-- ========================

CREATE OR REPLACE FUNCTION public.get_user_role_safe(user_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_profiles WHERE id = user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_user_admin_safe(user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.user_profiles WHERE id = user_id), false);
$$;

-- ========================
-- 5. ENABLE RLS
-- ========================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.all_golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapbox_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_security_settings_documentation ENABLE ROW LEVEL SECURITY;

-- ========================
-- 6. RLS POLICIES
-- ========================

-- user_profiles
CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users can insert their own profile" ON public.user_profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.user_profiles FOR SELECT USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins can update any profile" ON public.user_profiles FOR UPDATE USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins can delete profiles" ON public.user_profiles FOR DELETE USING (public.is_user_admin_safe(auth.uid()));

-- active_golf_courses
CREATE POLICY "Authenticated users can view golf courses" ON public.active_golf_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage golf courses" ON public.active_golf_courses FOR ALL USING (public.is_user_admin_safe(auth.uid()));

-- all_golf_courses
CREATE POLICY "Authenticated users can view all courses" ON public.all_golf_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage all courses" ON public.all_golf_courses FOR ALL USING (public.is_user_admin_safe(auth.uid()));

-- content_categories
CREATE POLICY "Authenticated users can view content categories" ON public.content_categories FOR SELECT TO authenticated USING (true);

-- content_files
CREATE POLICY "Admins can manage all content files" ON public.content_files FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Clients can view their golf course content" ON public.content_files FOR SELECT USING (
  golf_course_id IN (SELECT golf_course_id FROM public.user_profiles WHERE id = auth.uid() AND approved = true AND access_suspended = false)
);

-- access_requests
CREATE POLICY "Admins can manage access requests" ON public.access_requests FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Users can view their own requests" ON public.access_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their own requests" ON public.access_requests FOR INSERT WITH CHECK (user_id = auth.uid());

-- file_access_logs
CREATE POLICY "Admins can view all logs" ON public.file_access_logs FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Users can view their own logs" ON public.file_access_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can insert logs" ON public.file_access_logs FOR INSERT WITH CHECK (true);

-- mapbox_configs
CREATE POLICY "Users can view their mapbox config" ON public.mapbox_configs FOR SELECT USING (
  golf_course_id IN (SELECT golf_course_id FROM public.user_profiles WHERE id = auth.uid() AND approved = true)
);
CREATE POLICY "Admins can manage mapbox configs" ON public.mapbox_configs FOR ALL USING (public.is_user_admin_safe(auth.uid()));

-- auth_security_settings_documentation
CREATE POLICY "Admins can manage settings docs" ON public.auth_security_settings_documentation FOR ALL USING (public.is_user_admin_safe(auth.uid()));

-- ========================
-- 7. AUTH TRIGGER (auto-create profile on signup)
-- ========================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, full_name, approved)
  VALUES (
    NEW.id,
    NEW.email,
    'client',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'first_name', ''),
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================
-- 8. SEED DATA
-- ========================

INSERT INTO public.content_categories (name, description) VALUES
  ('Live Maps', 'Interactive course mapping files'),
  ('Reports', 'Analysis and documentation PDFs'),
  ('HD Maps', 'High-resolution course imagery'),
  ('3D Models', 'Three-dimensional course models')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.active_golf_courses (name, location, max_users, signup_enabled) VALUES
  ('Augusta National Golf Club', 'Georgia, USA', 5, true),
  ('Pebble Beach Golf Links', 'California, USA', 8, true),
  ('St. Andrews Links', 'Scotland, UK', 10, true),
  ('Pinehurst Resort', 'North Carolina, USA', 6, true);
