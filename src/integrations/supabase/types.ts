export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          request_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      active_golf_courses: {
        Row: {
          all_golf_course_id: string | null
          created_at: string | null
          id: number
          location: string | null
          max_users: number | null
          name: string
          signup_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          all_golf_course_id?: string | null
          created_at?: string | null
          id?: number
          location?: string | null
          max_users?: number | null
          name: string
          signup_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          all_golf_course_id?: string | null
          created_at?: string | null
          id?: number
          location?: string | null
          max_users?: number | null
          name?: string
          signup_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_golf_courses_all_golf_course_id_fkey"
            columns: ["all_golf_course_id"]
            isOneToOne: false
            referencedRelation: "all_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      all_golf_courses: {
        Row: {
          address: string | null
          city: string | null
          id: string
          name: string
          postcode: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          id?: string
          name: string
          postcode?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          id?: string
          name?: string
          postcode?: string | null
        }
        Relationships: []
      }
      analysis_sessions: {
        Row: {
          bounds: Json | null
          created_at: string | null
          description: string | null
          id: string
          session_name: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bounds?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          session_name: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bounds?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          session_name?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_security_settings_documentation: {
        Row: {
          current_status: string | null
          notes: string | null
          recommended_value: string | null
          setting_name: string
          updated_at: string | null
        }
        Insert: {
          current_status?: string | null
          notes?: string | null
          recommended_value?: string | null
          setting_name: string
          updated_at?: string | null
        }
        Update: {
          current_status?: string | null
          notes?: string | null
          recommended_value?: string | null
          setting_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      client_golf_courses: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          client_id: string
          golf_course_id: number
          id: string
          is_active: boolean | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          client_id: string
          golf_course_id: number
          id?: string
          is_active?: boolean | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          client_id?: string
          golf_course_id?: number
          id?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_golf_courses_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      content_files: {
        Row: {
          category_id: number | null
          created_at: string | null
          download_count: number | null
          fieldId: Database["public"]["Enums"]["file_category_type"] | null
          file_category:
            | Database["public"]["Enums"]["file_category_type"]
            | null
          file_extension: string | null
          file_hash: string | null
          file_path: string
          file_size: number | null
          filename: string
          golf_course_id: number | null
          gps_coordinates: unknown
          id: string
          is_mapbox_overlay: boolean | null
          is_tile_map: boolean | null
          last_accessed_at: string | null
          map_bounds: Json | null
          mapbox_layer_id: string | null
          metadata: Json | null
          mime_type: string | null
          original_filename: string | null
          preview_url: string | null
          r2_bucket_name: string | null
          r2_object_key: string | null
          status: string | null
          thumbnail_path: string | null
          tile_base_url: string | null
          tile_map_id: string | null
          tile_max_zoom: number | null
          tile_min_zoom: number | null
          updated_at: string | null
          upload_progress: number | null
          uploaded_by: string | null
          zoom_levels: number[] | null
        }
        Insert: {
          category_id?: number | null
          created_at?: string | null
          download_count?: number | null
          fieldId?: Database["public"]["Enums"]["file_category_type"] | null
          file_category?:
            | Database["public"]["Enums"]["file_category_type"]
            | null
          file_extension?: string | null
          file_hash?: string | null
          file_path: string
          file_size?: number | null
          filename: string
          golf_course_id?: number | null
          gps_coordinates?: unknown
          id?: string
          is_mapbox_overlay?: boolean | null
          is_tile_map?: boolean | null
          last_accessed_at?: string | null
          map_bounds?: Json | null
          mapbox_layer_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          original_filename?: string | null
          preview_url?: string | null
          r2_bucket_name?: string | null
          r2_object_key?: string | null
          status?: string | null
          thumbnail_path?: string | null
          tile_base_url?: string | null
          tile_map_id?: string | null
          tile_max_zoom?: number | null
          tile_min_zoom?: number | null
          updated_at?: string | null
          upload_progress?: number | null
          uploaded_by?: string | null
          zoom_levels?: number[] | null
        }
        Update: {
          category_id?: number | null
          created_at?: string | null
          download_count?: number | null
          fieldId?: Database["public"]["Enums"]["file_category_type"] | null
          file_category?:
            | Database["public"]["Enums"]["file_category_type"]
            | null
          file_extension?: string | null
          file_hash?: string | null
          file_path?: string
          file_size?: number | null
          filename?: string
          golf_course_id?: number | null
          gps_coordinates?: unknown
          id?: string
          is_mapbox_overlay?: boolean | null
          is_tile_map?: boolean | null
          last_accessed_at?: string | null
          map_bounds?: Json | null
          mapbox_layer_id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          original_filename?: string | null
          preview_url?: string | null
          r2_bucket_name?: string | null
          r2_object_key?: string | null
          status?: string | null
          thumbnail_path?: string | null
          tile_base_url?: string | null
          tile_map_id?: string | null
          tile_max_zoom?: number | null
          tile_min_zoom?: number | null
          updated_at?: string | null
          upload_progress?: number | null
          uploaded_by?: string | null
          zoom_levels?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "content_files_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_files_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      file_access_logs: {
        Row: {
          access_type: string
          accessed_at: string | null
          file_id: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          access_type: string
          accessed_at?: string | null
          file_id?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          access_type?: string
          accessed_at?: string | null
          file_id?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_access_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "content_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_course_tilesets: {
        Row: {
          attribution: string | null
          center_lat: number
          center_lon: number
          created_at: string | null
          default_zoom: number
          description: string | null
          flight_date: string | null
          flight_datetime: string | null
          flight_time: string | null
          format: string | null
          golf_course_id: number
          id: string
          is_active: boolean | null
          max_lat: number
          max_lon: number
          max_zoom: number
          metadata: Json | null
          min_lat: number
          min_lon: number
          min_zoom: number
          name: string
          r2_folder_path: string
          source_file_id: string | null
          tile_size: number | null
          tile_url_pattern: string
          updated_at: string | null
        }
        Insert: {
          attribution?: string | null
          center_lat: number
          center_lon: number
          created_at?: string | null
          default_zoom?: number
          description?: string | null
          flight_date?: string | null
          flight_datetime?: string | null
          flight_time?: string | null
          format?: string | null
          golf_course_id: number
          id?: string
          is_active?: boolean | null
          max_lat: number
          max_lon: number
          max_zoom?: number
          metadata?: Json | null
          min_lat: number
          min_lon: number
          min_zoom?: number
          name: string
          r2_folder_path: string
          source_file_id?: string | null
          tile_size?: number | null
          tile_url_pattern: string
          updated_at?: string | null
        }
        Update: {
          attribution?: string | null
          center_lat?: number
          center_lon?: number
          created_at?: string | null
          default_zoom?: number
          description?: string | null
          flight_date?: string | null
          flight_datetime?: string | null
          flight_time?: string | null
          format?: string | null
          golf_course_id?: number
          id?: string
          is_active?: boolean | null
          max_lat?: number
          max_lon?: number
          max_zoom?: number
          metadata?: Json | null
          min_lat?: number
          min_lon?: number
          min_zoom?: number
          name?: string
          r2_folder_path?: string
          source_file_id?: string | null
          tile_size?: number | null
          tile_url_pattern?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_tilesets_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      health_map_tilesets: {
        Row: {
          analysis_date: string
          analysis_time: string
          analysis_type: string | null
          center_lat: number
          center_lon: number
          created_at: string | null
          golf_course_id: number
          id: string
          is_active: boolean | null
          max_lat: number
          max_lon: number
          max_zoom: number | null
          min_lat: number
          min_lon: number
          min_zoom: number | null
          r2_folder_path: string
          source_tileset_id: string | null
          tile_url_pattern: string | null
          updated_at: string | null
        }
        Insert: {
          analysis_date: string
          analysis_time: string
          analysis_type?: string | null
          center_lat: number
          center_lon: number
          created_at?: string | null
          golf_course_id: number
          id?: string
          is_active?: boolean | null
          max_lat: number
          max_lon: number
          max_zoom?: number | null
          min_lat: number
          min_lon: number
          min_zoom?: number | null
          r2_folder_path: string
          source_tileset_id?: string | null
          tile_url_pattern?: string | null
          updated_at?: string | null
        }
        Update: {
          analysis_date?: string
          analysis_time?: string
          analysis_type?: string | null
          center_lat?: number
          center_lon?: number
          created_at?: string | null
          golf_course_id?: number
          id?: string
          is_active?: boolean | null
          max_lat?: number
          max_lon?: number
          max_zoom?: number | null
          min_lat?: number
          min_lon?: number
          min_zoom?: number | null
          r2_folder_path?: string
          source_tileset_id?: string | null
          tile_url_pattern?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_map_tilesets_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_map_tilesets_source_tileset_id_fkey"
            columns: ["source_tileset_id"]
            isOneToOne: false
            referencedRelation: "golf_course_tilesets"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          analysis_results: Json | null
          bucket: string | null
          content_type: string | null
          created_at: string | null
          file_size: number | null
          filename: string
          golf_course_id: number
          id: string
          lat: number | null
          lon: number | null
          original_filename: string
          path: string
          processing_completed_at: string | null
          processing_started_at: string | null
          status: string | null
          terrain_classification: Json | null
          tile_x: number | null
          tile_y: number | null
          updated_at: string | null
          user_id: string
          zoom_level: number | null
        }
        Insert: {
          analysis_results?: Json | null
          bucket?: string | null
          content_type?: string | null
          created_at?: string | null
          file_size?: number | null
          filename: string
          golf_course_id: number
          id?: string
          lat?: number | null
          lon?: number | null
          original_filename: string
          path: string
          processing_completed_at?: string | null
          processing_started_at?: string | null
          status?: string | null
          terrain_classification?: Json | null
          tile_x?: number | null
          tile_y?: number | null
          updated_at?: string | null
          user_id: string
          zoom_level?: number | null
        }
        Update: {
          analysis_results?: Json | null
          bucket?: string | null
          content_type?: string | null
          created_at?: string | null
          file_size?: number | null
          filename?: string
          golf_course_id?: number
          id?: string
          lat?: number | null
          lon?: number | null
          original_filename?: string
          path?: string
          processing_completed_at?: string | null
          processing_started_at?: string | null
          status?: string | null
          terrain_classification?: Json | null
          tile_x?: number | null
          tile_y?: number | null
          updated_at?: string | null
          user_id?: string
          zoom_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      mapbox_configs: {
        Row: {
          access_token: string
          bounds: Json | null
          created_at: string | null
          created_by: string | null
          default_center: unknown
          default_zoom: number | null
          golf_course_id: number | null
          id: string
          style_url: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          bounds?: Json | null
          created_at?: string | null
          created_by?: string | null
          default_center?: unknown
          default_zoom?: number | null
          golf_course_id?: number | null
          id?: string
          style_url?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          bounds?: Json | null
          created_at?: string | null
          created_by?: string | null
          default_center?: unknown
          default_zoom?: number | null
          golf_course_id?: number | null
          id?: string
          style_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mapbox_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapbox_configs_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      model_predictions: {
        Row: {
          created_at: string | null
          golf_course_id: number
          id: string
          metadata: Json | null
          r2_key: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          golf_course_id: number
          id: string
          metadata?: Json | null
          r2_key: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          golf_course_id?: number
          id?: string
          metadata?: Json | null
          r2_key?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_predictions_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          image_id: string
          job_type: string
          output_paths: string[] | null
          priority: number | null
          results: Json | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          image_id: string
          job_type: string
          output_paths?: string[] | null
          priority?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          image_id?: string
          job_type?: string
          output_paths?: string[] | null
          priority?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      session_images: {
        Row: {
          added_at: string | null
          id: string
          image_id: string
          session_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          image_id: string
          session_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          image_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_images_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_images_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analysis_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      user_login_logs: {
        Row: {
          id: string
          ip_address: unknown
          logged_in_at: string
          metadata: Json | null
          portal_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          ip_address?: unknown
          logged_in_at?: string
          metadata?: Json | null
          portal_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          ip_address?: unknown
          logged_in_at?: string
          metadata?: Json | null
          portal_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_profiles: {

        Row: {
          access_request_message: string | null
          access_request_pending: boolean | null
          access_requested_at: string | null
          access_suspended: boolean | null
          approved: boolean
          created_at: string | null
          email: string | null
          full_name: string | null
          golf_course_id: number | null
          golf_course_name: string | null
          id: string
          request_reason: string | null
          requested_at: string | null
          role: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string | null
        }
        Insert: {
          access_request_message?: string | null
          access_request_pending?: boolean | null
          access_requested_at?: string | null
          access_suspended?: boolean | null
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          golf_course_id?: number | null
          golf_course_name?: string | null
          id: string
          request_reason?: string | null
          requested_at?: string | null
          role?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          access_request_message?: string | null
          access_request_pending?: boolean | null
          access_requested_at?: string | null
          access_suspended?: boolean | null
          approved?: boolean
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          golf_course_id?: number | null
          golf_course_name?: string | null
          id?: string
          request_reason?: string | null
          requested_at?: string | null
          role?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_layers: {
        Row: {
          course_name: string | null
          created_at: string | null
          description: string | null
          file_size: number | null
          golf_course_id: number
          id: string
          is_active: boolean | null
          layer_type: string
          name: string
          r2_key: string
          style: Json | null
          updated_at: string | null
          z_index: number | null
        }
        Insert: {
          course_name?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          golf_course_id: number
          id?: string
          is_active?: boolean | null
          layer_type: string
          name: string
          r2_key: string
          style?: Json | null
          updated_at?: string | null
          z_index?: number | null
        }
        Update: {
          course_name?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          golf_course_id?: number
          id?: string
          is_active?: boolean | null
          layer_type?: string
          name?: string
          r2_key?: string
          style?: Json | null
          updated_at?: string | null
          z_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vector_layers_golf_course_id_fkey"
            columns: ["golf_course_id"]
            isOneToOne: false
            referencedRelation: "active_golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_user_role_safe: { Args: { user_id: string }; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      is_user_admin_safe: { Args: { user_id: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      file_category_type: "live_maps" | "reports" | "hd_maps" | "3d_models"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      file_category_type: ["live_maps", "reports", "hd_maps", "3d_models"],
    },
  },
} as const
