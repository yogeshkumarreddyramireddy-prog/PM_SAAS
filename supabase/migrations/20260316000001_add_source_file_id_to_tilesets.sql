-- Add source_file_id to golf_course_tilesets to link tilesets back to their origin TIFF upload
ALTER TABLE public.golf_course_tilesets
  ADD COLUMN IF NOT EXISTS source_file_id text;

-- Index for fast lookup when cascading deletes
CREATE INDEX IF NOT EXISTS idx_golf_course_tilesets_source_file_id
  ON public.golf_course_tilesets(source_file_id);
