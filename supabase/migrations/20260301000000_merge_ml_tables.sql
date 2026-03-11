-- Create ML tables adapted for PhytoMaps Final (linking to active_golf_courses)

-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. golf_course_tilesets
CREATE TABLE IF NOT EXISTS public.golf_course_tilesets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    golf_course_id integer NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    min_lat double precision NOT NULL,
    max_lat double precision NOT NULL,
    min_lon double precision NOT NULL,
    max_lon double precision NOT NULL,
    center_lat double precision NOT NULL,
    center_lon double precision NOT NULL,
    min_zoom integer DEFAULT 12 NOT NULL,
    max_zoom integer DEFAULT 20 NOT NULL,
    default_zoom integer DEFAULT 16 NOT NULL,
    r2_folder_path text NOT NULL,
    tile_url_pattern text NOT NULL,
    tile_size integer DEFAULT 256,
    format text DEFAULT 'png'::text,
    attribution text,
    metadata jsonb,
    is_active boolean DEFAULT true,
    flight_date date,
    flight_time time without time zone,
    flight_datetime timestamp without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. health_map_tilesets
CREATE TABLE IF NOT EXISTS public.health_map_tilesets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    golf_course_id integer NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
    source_tileset_id uuid REFERENCES public.golf_course_tilesets(id) ON DELETE CASCADE,
    r2_folder_path text NOT NULL,
    tile_url_pattern text DEFAULT '{z}/{x}/{y}.png'::text,
    analysis_type text DEFAULT 'ndvi'::text,
    analysis_date date NOT NULL,
    analysis_time time without time zone NOT NULL,
    min_lat double precision NOT NULL,
    max_lat double precision NOT NULL,
    min_lon double precision NOT NULL,
    max_lon double precision NOT NULL,
    center_lat double precision NOT NULL,
    center_lon double precision NOT NULL,
    min_zoom integer DEFAULT 14,
    max_zoom integer DEFAULT 20,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 3. vector_layers
CREATE TABLE IF NOT EXISTS public.vector_layers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    golf_course_id integer NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    layer_type text NOT NULL,
    r2_key text NOT NULL,
    file_size bigint,
    style jsonb DEFAULT '{"fillColor": "#3F51B5", "fillOpacity": 0.5, "strokeColor": "#1A237E", "strokeWidth": 2}'::jsonb,
    is_active boolean DEFAULT true,
    z_index integer DEFAULT 0,
    course_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 4. images (Raw drone images)
CREATE TABLE IF NOT EXISTS public.images (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    golf_course_id integer NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
    filename text NOT NULL,
    original_filename text NOT NULL,
    bucket text DEFAULT 'phytomaps-files'::text,
    path text NOT NULL,
    file_size bigint,
    content_type text DEFAULT 'image/png'::text,
    lat double precision,
    lon double precision,
    zoom_level integer,
    tile_x integer,
    tile_y integer,
    status text DEFAULT 'uploaded'::text,
    processing_started_at timestamp with time zone,
    processing_completed_at timestamp with time zone,
    analysis_results jsonb,
    terrain_classification jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 5. processing_jobs
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type text NOT NULL,
    status text DEFAULT 'queued'::text,
    priority integer DEFAULT 1,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    results jsonb,
    output_paths text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 6. analysis_sessions
CREATE TABLE IF NOT EXISTS public.analysis_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_name text NOT NULL,
    description text,
    bounds jsonb,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 7. session_images
CREATE TABLE IF NOT EXISTS public.session_images (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES public.analysis_sessions(id) ON DELETE CASCADE,
    image_id uuid NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
    added_at timestamp with time zone DEFAULT now()
);

-- 8. model_predictions
CREATE TABLE IF NOT EXISTS public.model_predictions (
    id text PRIMARY KEY,
    golf_course_id integer NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
    r2_key text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- 9. client_golf_courses (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.client_golf_courses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    golf_course_id integer NOT NULL REFERENCES public.active_golf_courses(id) ON DELETE CASCADE,
    assigned_at timestamp with time zone DEFAULT now(),
    assigned_by uuid REFERENCES auth.users(id),
    is_active boolean DEFAULT true,
    UNIQUE(client_id, golf_course_id)
);

-- Add update triggers for ALL tables
CREATE TRIGGER update_golf_course_tilesets_updated_at BEFORE UPDATE ON public.golf_course_tilesets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_health_map_tilesets_updated_at BEFORE UPDATE ON public.health_map_tilesets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vector_layers_updated_at BEFORE UPDATE ON public.vector_layers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_images_updated_at BEFORE UPDATE ON public.images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_analysis_sessions_updated_at BEFORE UPDATE ON public.analysis_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update flight datetime function for golf_course_tilesets
CREATE OR REPLACE FUNCTION public.update_flight_datetime() 
RETURNS trigger AS $$
BEGIN
    IF NEW.flight_date IS NOT NULL AND NEW.flight_time IS NOT NULL THEN
        NEW.flight_datetime := (NEW.flight_date + NEW.flight_time);
    ELSIF NEW.flight_date IS NOT NULL THEN
        NEW.flight_datetime := NEW.flight_date::timestamp;
    ELSE
        NEW.flight_datetime := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_golf_course_tilesets_flight_datetime
    BEFORE INSERT OR UPDATE ON public.golf_course_tilesets
    FOR EACH ROW EXECUTE FUNCTION public.update_flight_datetime();


-- RLS POLICIES (Strict Vista-style policies)

ALTER TABLE public.golf_course_tilesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_map_tilesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vector_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_golf_courses ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins have full access" ON public.golf_course_tilesets FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.health_map_tilesets FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.vector_layers FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.images FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.processing_jobs FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.analysis_sessions FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.session_images FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.model_predictions FOR ALL USING (public.is_user_admin_safe(auth.uid()));
CREATE POLICY "Admins have full access" ON public.client_golf_courses FOR ALL USING (public.is_user_admin_safe(auth.uid()));

-- Clients can select Data for their assigned golf courses (IF approved)
-- golf_course_tilesets
CREATE POLICY "Clients can view their golf course tilesets" ON public.golf_course_tilesets FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = golf_course_tilesets.golf_course_id)
    OR EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = golf_course_tilesets.golf_course_id)
);

-- health_map_tilesets
CREATE POLICY "Clients can view their health map tilesets" ON public.health_map_tilesets FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = health_map_tilesets.golf_course_id)
    OR EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = health_map_tilesets.golf_course_id)
);

-- vector_layers
CREATE POLICY "Clients can view their vector layers" ON public.vector_layers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = vector_layers.golf_course_id)
    OR EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = vector_layers.golf_course_id)
);

-- images (Clients can view their course images AND insert new images)
CREATE POLICY "Clients can view their images" ON public.images FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = images.golf_course_id)
    OR EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = images.golf_course_id)
);
CREATE POLICY "Clients can insert images" ON public.images FOR INSERT WITH CHECK (
    user_id = auth.uid() AND (
        EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = images.golf_course_id)
        OR EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = images.golf_course_id)
    )
);

-- processing_jobs (Clients view their own)
CREATE POLICY "Clients can view their processing jobs" ON public.processing_jobs FOR SELECT USING (
    user_id = auth.uid()
);

-- analysis_sessions (Clients manage their own)
CREATE POLICY "Clients can manage their sessions" ON public.analysis_sessions FOR ALL USING (user_id = auth.uid());

-- model_predictions (Clients can view their course predictions)
CREATE POLICY "Clients can view their model predictions" ON public.model_predictions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.approved = true AND up.access_suspended = false AND up.golf_course_id = model_predictions.golf_course_id)
    OR EXISTS (SELECT 1 FROM public.client_golf_courses cgc WHERE cgc.client_id = auth.uid() AND cgc.is_active = true AND cgc.golf_course_id = model_predictions.golf_course_id)
);

-- client_golf_courses (Clients can only see their own assignments)
CREATE POLICY "Clients can view their assignments" ON public.client_golf_courses FOR SELECT USING (client_id = auth.uid());
