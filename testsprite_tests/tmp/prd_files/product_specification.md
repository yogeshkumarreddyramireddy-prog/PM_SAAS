# Product Requirements Document: PhytoMaps Final

## 1. Project Overview
**PhytoMaps Final** is a unified, premium golf course mapping and geospatial analysis platform. It combines a robust user interface, role-based authentication, and content delivery (originally from *PhytoMap Vista*) with advanced machine learning pipelines, multispectral imagery rendering, and advanced map layers (originally from *Phyto Demo*).

**Objective**: Provide an end-to-end platform for golf course administrators and clients to securely view, manage, and analyze high-resolution drone imagery and multispectral vegetation data to monitor course health and optimize maintenance.

## 2. Target Audience & User Roles
The platform caters to two distinct user roles governed by strict Row Level Security (RLS) policies:

*   **Administrators (`admin`)**: Can manage all users, approve access requests, assign clients to specific golf courses, upload drone imagery/vector layers, and configure platform settings (Mapbox tokens, etc.).
*   **Clients (`client`)**: Golf course managers or agronomists. They have read-only or restricted-write access strictly limited to their assigned golf course(s). They can view health maps, download reports, and interact with the dynamic vegetation analysis tools.

## 3. Core Features

### 3.1. Map Viewer & Geospatial Analysis
*   **Interactive Map**: Powered by Mapbox GL JS and deck.gl, rendering high-definition base maps (satellite imagery).
*   **Multispectral COG Rendering**: Directly loads and renders Cloud Optimized GeoTIFFs (COGs) natively in the browser. Uses a custom `VegetationIndexLayer` and GLSL shaders to dynamically calculate vegetation indices on the fly.
*   **Vegetation Indices**: Supports multiple scientifically accurate analysis models:
    *   **NDVI** (Normalized Difference Vegetation Index)
    *   **NDRE** (Normalized Difference Red Edge)
    *   **CI-RedEdge** (Chlorophyll Index - Red Edge)
*   **Dynamic UI Controls**: Features interactive dual-handle sliders (min/max range selection) and dynamic histogram scaling for precise visualization and thresholding of vegetation stress.
*   **Vector Layers**: Supports GeoJSON overlays (e.g., course boundaries, fairways, hazards) that can be toggled on/off.
*   **Dual-Map Comparison**: A swipe-view mode to compare two different map layers (e.g., RGB vs. NDVI, or historical vs. current data) side-by-side.

### 3.2. Authentication & Security
*   **Role-Based Access Control**: Built on Supabase Auth.
*   **Approval Workflow**: New client signups require admin approval before granting platform access.
*   **Row-Level Security (RLS)**: Enforced at the PostgreSQL level. Clients can strictly only access rows (images, tilesets, vector layers) linked to their assigned `golf_course_id`.

### 3.3. Content & File Management
*   **Cloudflare R2 Storage**: All heavy assets (XYZ tiles, raw drone images, PDFs, 3D models) are stored in Cloudflare R2, mapped to the `phytomaps-files` bucket in a structured, course-scoped hierarchy (`courses/{id}/*`).
*   **Secure Access**: Asset access is mediated through Supabase Edge Functions (`r2-presign`, `tile-proxy`) to validate user JWTs and ensure only authorized users can fetch or upload specific files.
*   **Content Types**: Supports PDF reports, 3D models, Orthomosaics, and raw drone image ingestion.

### 3.4. Machine Learning Pipeline (Drone Imagery Ingestion)
*   **Upload**: Admins/clients can upload raw drone images.
*   **Edge Processing**: Uploads trigger database hooks that queue processing jobs.
*   **Inference**: Supabase Edge functions (`process-image`, `model-inference`) handle routing imagery through a U-Net ML model for terrain classification and vegetation health prediction.
*   **Results**: ML outputs are saved back to R2 and linked via the `model_predictions` database table for rendering on the frontend.

## 4. Technical Architecture

*   **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui.
*   **Geospatial**: deck.gl, Mapbox GL JS, GeoTIFF.js, Turf.js.
*   **Backend / Database**: Supabase (PostgreSQL).
*   **Serverless**: Supabase Edge Functions (Deno) for ML inference, map tile proxying, and secure R2 bucket operations.
*   **Storage**: Cloudflare R2 (S3-compatible API).

## 5. Database Schema Highlights
*   `user_profiles`: Extends auth users with roles, approval status, and course assignments.
*   `active_golf_courses`: Directory of active courses on the platform.
*   `client_golf_courses`: Many-to-many relationship mapping clients to courses.
*   `golf_course_tilesets` & `health_map_tilesets`: Metadata for rendering XYZ tile layers.
*   `vector_layers`: GeoJSON configurations.
*   `images`, `processing_jobs`, `model_predictions`: Tables orchestrating the ML inference pipeline.

## 6. Edge Function Architecture
The platform relies on ~20 modular Edge Functions:
*   **Storage Operations**: `r2-upload`, `r2-presign`, `r2-delete`, `r2-download`.
*   **Map Rendering**: `tile-proxy` (serves XYZ tiles securely), `get-mapbox-token`.
*   **Machine Learning**: `process-image`, `analyse-image`, `model-inference`.
*   **Admin/User Ops**: `create-client-user`, `manage-client-courses`.

## 7. Future Considerations
*   **Automated Drone Integration**: Direct API ingestion from drone flight software.
*   **Time-Series Analysis**: Advanced analytics to track vegetation health trends over weeks/months.
*   **Advanced ML Models**: Adding pest detection or precise water-stress classification.
