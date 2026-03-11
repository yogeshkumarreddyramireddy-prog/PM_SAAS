# PhytoMaps Final — Detailed Implementation Plan

> **Goal**: Merge **PhytoMap Vista** (UI, auth, content delivery) and **Phyto Demo / interns_0925** (ML pipeline, advanced map layers) into a single, production-ready project.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Phase 1: Project Scaffolding](#3-phase-1-project-scaffolding)
4. [Phase 2: Database Schema Consolidation](#4-phase-2-database-schema-consolidation)
5. [Phase 3: Edge Functions Consolidation](#5-phase-3-edge-functions-consolidation)
6. [Phase 4: Frontend Merge](#6-phase-4-frontend-merge)
7. [Phase 5: R2 Bucket Restructuring](#7-phase-5-r2-bucket-restructuring)
8. [Phase 6: Testing & Verification](#8-phase-6-testing--verification)
9. [Appendix A: Full Table Schemas](#appendix-a-full-table-schemas)
10. [Appendix B: Edge Function Inventory](#appendix-b-edge-function-inventory)

---

## 1. Project Overview

### Source Projects

| Property | PhytoMap Vista (Dream Map Viewer) | Phyto Demo (interns_0925) |
|---|---|---|
| **Supabase Project ID** | `dlbklwrojvtmftmzcrkf` | `efnorpyrsfoxooufujnd` |
| **Local Path** | `/antigravity/phyto-map-vista/` | `/antigravity/interns_0925_Full_Stack/frontend/` |
| **Tech Stack** | Vite + React + TypeScript + Tailwind + shadcn/ui | Vite + React + TypeScript + Tailwind + shadcn/ui |
| **Strengths** | Premium UI, robust auth, content management, mature R2 functions | ML pipeline, vector layers, health maps, dual-map comparison |
| **Weaknesses** | No ML capabilities, basic map viewer | Fragmented auth, leaky RLS policies, prototype-quality code |

### Target Project

| Property | Value |
|---|---|
| **Name** | PhytoMaps Final |
| **Local Path** | `/antigravity/phytomaps-final/` |
| **Supabase Project** | *(to be created by user)* |
| **R2 Bucket** | *(to be created by user)* |
| **Git Remote** | *(to be created by user on GitHub)* |

### What Goes Where

| Aspect | Source |
|---|---|
| **UI Shell** (sidebar, navigation, layouts, themes) | Vista |
| **Authentication** (AuthContext, login/signup, role management) | Vista |
| **User Management** (admin panel, approvals, suspensions) | Vista |
| **Content Management** (file browsing, reports, PDFs, 3D models) | Vista |
| **Map Viewer** (Mapbox, tile rendering, overlays) | Demo (enhanced) |
| **Map Features** (vector layers, health maps, dual-map swipe, predictions) | Demo |
| **Image Upload & ML Pipeline** (drone imagery → inference → results) | Demo |
| **R2 Storage Functions** (upload, download, presign, multipart) | Vista |
| **Database Schema** | Vista naming + Demo ML tables |
| **RLS Policies** | Vista patterns (strict) |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PhytoMaps Final                         │
│                   (React + Vite + TS)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Auth Layer  │  │  Content     │  │   Map Viewer     │  │
│  │   (Vista)     │  │  Manager     │  │   (Demo maps +   │  │
│  │              │  │  (Vista)     │  │    Vista UI)      │  │
│  │  • AuthCtx    │  │  • Files     │  │  • Tilesets      │  │
│  │  • Login      │  │  • Reports   │  │  • Health Maps   │  │
│  │  • Signup     │  │  • 3D Models │  │  • Vector Layers │  │
│  │  • Roles      │  │  • Categories│  │  • Dual Swipe    │  │
│  │  • Approvals  │  │  • Downloads │  │  • ML Overlays   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                 │                  │              │
├─────────┴─────────────────┴──────────────────┴──────────────┤
│                     Supabase Backend                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Edge Functions                                      │   │
│  │  • R2 ops (Vista)  • tile-proxy  • ML pipeline (Demo)│   │
│  │  • create-user     • mapbox-cfg  • vector-layers     │   │
│  └──────────────────────┬───────────────────────────────┘   │
│  ┌──────────────────────┴───────────────────────────────┐   │
│  │  PostgreSQL (RLS-protected)                          │   │
│  │  Vista tables: user_profiles, active_golf_courses,   │   │
│  │    content_files, mapbox_configs, file_access_logs    │   │
│  │  Demo tables: golf_course_tilesets, health_map_       │   │
│  │    tilesets, vector_layers, images, processing_jobs,  │   │
│  │    analysis_sessions, model_predictions               │   │
│  └──────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                Cloudflare R2 (phytomaps-files)              │
│  courses/{id}/tilesets/ | health-maps/ | vector-layers/     │
│  courses/{id}/raw-images/ | predictions/ | reports/ | maps/ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 1: Project Scaffolding

### Steps

1. **Copy PhytoMap Vista** as the base:
   ```bash
   cp -r phyto-map-vista/ phytomaps-final/
   ```

2. **Clean Git history** — start fresh:
   ```bash
   cd phytomaps-final
   rm -rf .git
   git init
   ```

3. **Update project metadata**:
   - `package.json` → `"name": "phytomaps-final"`
   - `index.html` → `<title>PhytoMaps Final</title>`
   - Create new `README.md`

4. **Create `.env`** (once user provides credentials):
   ```env
   VITE_SUPABASE_URL="https://<new-project-id>.supabase.co"
   VITE_SUPABASE_ANON_KEY="<new-anon-key>"
   VITE_SUPABASE_PROJECT_ID="<new-project-id>"
   VITE_MAPBOX_ACCESS_TOKEN="<mapbox-token>"
   VITE_R2_PUBLIC_URL="<r2-public-url>"
   ```

5. **Verify it runs**: `npm install && npm run dev`

### Deliverable
A working copy of the Vista UI running locally under the new project name.

---

## 4. Phase 2: Database Schema Consolidation

### 4.1 — Tables Kept from Vista (no changes)

#### `user_profiles`
The core user table. Superior to Demo's `users` table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK, FK → auth.users) | |
| `email` | text (NOT NULL) | |
| `role` | text (NOT NULL) | `'admin'` or `'client'` |
| `full_name` | text | |
| `golf_course_id` | int (FK → active_golf_courses) | Primary course assignment |
| `approved` | boolean (default: true) | Admin must approve |
| `access_suspended` | boolean (default: false) | Can be suspended |
| `suspension_reason` | text | |
| `suspended_at` / `suspended_by` | timestamptz / uuid | Audit trail |
| `access_request_pending` | boolean | |
| `access_request_message` | text | |
| `golf_course_name` | text | Denormalized for display |
| `created_at` / `updated_at` | timestamptz | |

**Why Vista wins**: Demo's `users` has only 8 columns (id, email, full_name, organization, role, club_id, created_at, updated_at). Vista has 17 columns with approval workflow, suspension, and access request tracking.

---

#### `active_golf_courses`
The golf courses currently on the platform.

| Column | Type | Notes |
|---|---|---|
| `id` | serial (PK) | |
| `name` | text (NOT NULL) | |
| `location` | text | |
| `max_users` | int (default: 5) | Capacity management |
| `signup_enabled` | boolean (default: true) | Self-service toggle |
| `all_golf_course_id` | uuid (FK → all_golf_courses) | Links to master directory |
| `created_at` / `updated_at` | timestamptz | |

**Why Vista wins**: Demo's `golf_clubs` has only 5 columns (id, name, client_id, created_at, updated_at). No location, no capacity management.

---

#### Other Vista Tables (kept as-is)
- **`all_golf_courses`** — Master directory (name, address, postcode, city)
- **`content_files`** — 30+ column file management table (R2 keys, categories, tiles, GPS, thumbnails, download counts)
- **`content_categories`** — File categories (id, name, description)
- **`mapbox_configs`** — Per-course Mapbox tokens, styles, center points, zoom levels
- **`file_access_logs`** — Audit trail (file_id, user_id, access_type, IP, user agent)
- **`access_requests`** — User access request workflow (request_type, status, reviewed_by)
- **`auth_security_settings_documentation`** — Reference table

---

### 4.2 — Tables Added from Demo (adapted to Vista naming)

All foreign keys referencing `golf_club_id` (uuid) in the Demo will be changed to `golf_course_id` (int, FK → `active_golf_courses.id`).

#### `golf_course_tilesets` (NEW)
XYZ map tilesets for each golf course.

| Column | Type | Adaptation |
|---|---|---|
| `id` | uuid (PK) | |
| `golf_course_id` | **int** (FK → active_golf_courses) | Changed from `golf_club_id` (uuid) |
| `name` | text (NOT NULL) | |
| `description` | text | |
| `min_lat` / `max_lat` / `min_lon` / `max_lon` | double precision | Bounding box |
| `center_lat` / `center_lon` | double precision | Map center |
| `min_zoom` / `max_zoom` / `default_zoom` | int | Zoom range |
| `r2_folder_path` | text (NOT NULL) | Path in R2 bucket |
| `tile_url_pattern` | text (NOT NULL) | e.g., `{z}/{x}/{y}.png` |
| `tile_size` | int (default: 256) | |
| `format` | text (default: 'png') | |
| `attribution` | text | |
| `metadata` | jsonb | |
| `is_active` | boolean (default: true) | |
| `flight_date` / `flight_time` / `flight_datetime` | date / time / timestamp | When the drone captured imagery |
| `created_at` / `updated_at` | timestamptz | |

---

#### `health_map_tilesets` (NEW)
NDVI/stress analysis layers derived from source tilesets.

| Column | Type | Adaptation |
|---|---|---|
| `id` | uuid (PK) | |
| `golf_course_id` | **int** (FK → active_golf_courses) | Changed from `golf_club_id` (text) |
| `source_tileset_id` | uuid (FK → golf_course_tilesets) | |
| `r2_folder_path` | text (NOT NULL) | |
| `tile_url_pattern` | text | |
| `analysis_type` | text (default: 'ndvi') | e.g., 'ndvi', 'stress' |
| `analysis_date` / `analysis_time` | date / time | |
| `min_lat` / `max_lat` / `min_lon` / `max_lon` | double precision | |
| `center_lat` / `center_lon` | double precision | |
| `min_zoom` / `max_zoom` | int | |
| `is_active` | boolean (default: true) | |
| `created_at` / `updated_at` | timestamptz | |

---

#### `vector_layers` (NEW)
GeoJSON polygon overlays for map features.

| Column | Type | Adaptation |
|---|---|---|
| `id` | uuid (PK) | |
| `golf_course_id` | **int** (FK → active_golf_courses) | Changed from `golf_club_id` (uuid) |
| `name` | text (NOT NULL) | |
| `description` | text | |
| `layer_type` | text (NOT NULL) | e.g., 'boundary', 'hazard', 'fairway' |
| `r2_key` | text (NOT NULL) | Path to GeoJSON in R2 |
| `file_size` | bigint | |
| `style` | jsonb | `{fillColor, fillOpacity, strokeColor, strokeWidth}` |
| `is_active` | boolean (default: true) | |
| `z_index` | int (default: 0) | Layer stacking order |
| `course_name` | text | Denormalized |
| `created_at` / `updated_at` | timestamptz | |

---

#### `images` (NEW)
Raw drone/UAV images uploaded for ML processing.

| Column | Type | Adaptation |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → auth.users) | |
| `golf_course_id` | **int** (FK → active_golf_courses) | **NEW column** — link image to a course |
| `filename` / `original_filename` | text (NOT NULL) | |
| `bucket` | text (default: new bucket name) | Changed from `'raw-images'` |
| `path` | text (NOT NULL) | R2 path |
| `file_size` | bigint | |
| `content_type` | text | |
| `lat` / `lon` | double precision | GPS coordinates |
| `zoom_level` / `tile_x` / `tile_y` | int | Tile coordinates |
| `status` | text (default: 'uploaded') | `uploaded` → `processing` → `completed` → `failed` |
| `processing_started_at` / `processing_completed_at` | timestamptz | |
| `analysis_results` / `terrain_classification` | jsonb | ML output |
| `created_at` / `updated_at` | timestamptz | |

---

#### `processing_jobs` (NEW)
ML job queue.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `image_id` | uuid (FK → images) | |
| `user_id` | uuid (FK → auth.users) | |
| `job_type` | text (NOT NULL) | e.g., `golf_course_classification` |
| `status` | text (default: 'queued') | `queued` → `processing` → `completed` → `failed` |
| `priority` | int (default: 1) | |
| `started_at` / `completed_at` | timestamptz | |
| `error_message` | text | |
| `results` | jsonb | |
| `output_paths` | text[] | Array of R2 paths |
| `created_at` / `updated_at` | timestamptz | |

---

#### `analysis_sessions` (NEW)
Groups images into processing batches.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → auth.users) | |
| `session_name` | text (NOT NULL) | |
| `description` | text | |
| `bounds` | jsonb | Geographic bounding box |
| `status` | text (default: 'active') | |
| `created_at` / `updated_at` | timestamptz | |

---

#### `session_images` (NEW)
Many-to-many link between sessions and images.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `session_id` | uuid (FK → analysis_sessions) | |
| `image_id` | uuid (FK → images) | |
| `added_at` | timestamptz (default: now()) | |

---

#### `model_predictions` (NEW)
ML model output references.

| Column | Type | Adaptation |
|---|---|---|
| `id` | text (PK) | |
| `golf_course_id` | **int** (FK → active_golf_courses) | Changed from `golf_club_id` (uuid) |
| `r2_key` | text (NOT NULL) | Path in R2 |
| `user_id` | uuid | |
| `metadata` | jsonb | |
| `created_at` | timestamptz | |

---

#### `client_golf_courses` (NEW)
Many-to-many assignment of clients to courses.

| Column | Type | Adaptation |
|---|---|---|
| `id` | uuid (PK) | |
| `client_id` | uuid (FK → auth.users) | |
| `golf_course_id` | **int** (FK → active_golf_courses) | Changed from `golf_club_id` (uuid) |
| `assigned_at` | timestamptz (default: now()) | |
| `assigned_by` | uuid | Admin who assigned |
| `is_active` | boolean (default: true) | |

---

### 4.3 — Database Functions (Unified)

| Function | Source | Purpose |
|---|---|---|
| `is_admin()` | Vista | Returns true if current user is admin |
| `is_user_admin_safe()` | Vista | SECURITY DEFINER version |
| `get_user_role_safe()` | Vista | Returns role securely |
| `get_user_role()` | Vista | Returns role |
| `get_user_profile()` | Vista | Returns full profile record |
| `handle_new_user()` | Vista | Creates `user_profiles` row on auth.users insert |
| `handle_user_approval()` | Vista | Trigger on approval status change |
| `update_updated_at_column()` | Vista | Generic timestamp trigger |
| `update_file_access_stats()` | Vista | Updates file access counts |
| `cleanup_old_access_logs()` | Vista | Maintenance function |
| `audit_role_changes()` | Vista | Audit trigger |
| `get_mapbox_config_with_masked_token()` | Vista | Returns config with masked token |
| `get_mapbox_token_for_map()` | Vista | Returns raw token for authorized users |
| `create_test_user()` | Vista | Development utility |
| `trigger_image_processing()` | Demo | Fires on image insert to queue ML job |
| `update_flight_datetime()` | Demo | Combines flight_date + flight_time |
| `get_client_golf_courses()` | Demo (adapted) | Returns courses for a client |
| `client_has_course_access()` | Demo (adapted) | Boolean check |
| `assign_client_to_course()` | Demo (adapted) | Admin function |
| `remove_client_from_course()` | Demo (adapted) | Admin function |

### 4.4 — RLS Policy Strategy

**Pattern** (applied consistently to ALL tables):
- `SELECT` for own data: `auth.uid() = user_id` or `golf_course_id IN (user's assigned courses)`
- `SELECT` for admins: `is_user_admin_safe(auth.uid()) = true`
- `INSERT/UPDATE/DELETE` for own data: `auth.uid() = user_id`
- `ALL` for admins: `is_user_admin_safe(auth.uid()) = true`
- **NO** open `SELECT → true` policies (fixing Demo's security holes)

---

## 5. Phase 3: Edge Functions Consolidation

### From Vista (14 functions → keep 13)

| Function | JWT | Action |
|---|---|---|
| `r2-upload` | ✅ | Keep — handles file uploads to R2 |
| `r2-direct-upload` | ✅ | Keep — direct client-to-R2 |
| `r2-download` | ❌ | Keep — fetches files from R2 |
| `r2-delete` | ✅ | Keep — removes files from R2 |
| `r2-complete` | ✅ | Keep — completes multipart uploads |
| `r2-presign` | ✅ | Keep — generates presigned URLs |
| `r2-list-folders` | ✅ | Keep — browses R2 directory |
| `r2-register` | ✅ | Keep — registers files in DB |
| `r2-assign-tilemap` | ✅ | Keep — links tilesets to courses |
| `extract-zip-tiles` | ✅ | Keep — unzips tile archives |
| `tile-proxy` | ❌ | **Keep (winner)** — v106, more mature |
| `create-client-user` | ✅ | Keep — admin user creation |
| `get-mapbox-token` | ✅ | Keep — secure token retrieval |
| `get-secure-mapbox-config` | ✅ | Keep — full config retrieval |

### From Demo (9 functions → keep 6, merged/adapted)

| Function | JWT | Action |
|---|---|---|
| `process-image` | ✅ | **Keep (adapted)** — entry point for image processing |
| `analyse-image` | ✅ | **Keep (adapted)** — initial analysis |
| `model-inference` | ✅ | **Keep (adapted)** — core ML U-Net inference |
| `upload-vector-layer` | ✅ | **Keep (adapted)** — GeoJSON upload |
| `get-vector-layers` | ✅ | **Keep (adapted)** — fetch layers for a course |
| `manage-client-courses` | ✅ | **Keep (adapted)** — client-course assignments |
| `r2-sign` | ✅ | **Merge** into Vista's `r2-presign` |
| `tile-proxy` | ❌ | **Drop** — Vista's is better (v106 vs v16) |
| `delete-user` | ✅ | **Keep (adapted)** — user deletion |

### Adaptations Required for Demo Functions
1. Change all `users` table references → `user_profiles`
2. Change all `golf_clubs` / `golf_club_id` references → `active_golf_courses` / `golf_course_id`
3. Update R2 bucket name to new bucket
4. Update Supabase client initialization to new project URL

---

## 6. Phase 4: Frontend Merge

### 6.1 — Keep Entirely from Vista
- `src/hooks/useAuth.tsx` — AuthContext Provider
- `src/integrations/supabase/client.ts` — Supabase client
- `src/pages/Auth.tsx`, `src/pages/ResetPassword.tsx` — Login/signup flows
- `src/pages/Dashboard.tsx` — Main dashboard
- `src/pages/AdminDashboard.tsx` — Admin panel
- `src/components/Sidebar.tsx` — Navigation
- All content file management components
- All admin user management components
- All UI primitives (`src/components/ui/`)

### 6.2 — Integrate from Demo
| Component | Where It Goes | Changes Required |
|---|---|---|
| `MapboxGolfCourseMap.tsx` | Replace/enhance Vista's map viewer | Update imports to use Vista's `useAuth`, change `golf_club_id` refs |
| `DualMapSwipe.tsx` | New tab/view in golf course dashboard | Import mapbox-gl, update auth |
| `VectorLayerOverlayMap.tsx` | Layer toggle in map viewer | Update Supabase queries |
| `VectorLayerComparison.tsx` | New comparison view | Update auth + queries |
| `HealthMapUploader.tsx` | Admin dashboard → new section | Update auth + R2 service |
| `ModelPredictionOverlay.tsx` | Layer toggle in map viewer | Update queries |
| `admin/VectorLayerUploader.tsx` | Admin dashboard → new section | Update auth + edge function URL |

### 6.3 — New Feature: Image Upload Button
- **Location**: Client golf course dashboard (alongside existing content cards)
- **Access**: Both admin and client users for their assigned course
- **Flow**:
  1. User clicks "Upload Images" button
  2. File picker opens (accepts `.png`, `.jpg`, `.tiff`)
  3. Files upload via `r2-presign` → R2 `courses/{id}/raw-images/`
  4. `images` table row inserted (triggers `trigger_image_processing`)
  5. Processing job queued → `model-inference` edge function called
  6. Results stored in `model_predictions` table
  7. User sees processing status indicator on dashboard

### 6.4 — Service Layer Updates
| File | Changes |
|---|---|
| `lib/supabase.ts` | Already correct (uses env vars) |
| `lib/imageService.ts` | Port from Demo, update to use Vista auth |
| `lib/r2Service.ts` | Port from Demo, merge with Vista's R2 helpers |
| `lib/tileAccessService.ts` | Port from Demo, update queries |
| `lib/modelInferenceService.ts` | Port from Demo, update to new schema |
| `lib/clientCourseService.ts` | Port from Demo, update table names |

---

## 7. Phase 5: R2 Bucket Restructuring

### New Bucket: `phytomaps-files`

```
phytomaps-files/
├── courses/
│   └── {golf_course_id}/
│       ├── tilesets/
│       │   └── {tileset_id}/
│       │       └── {z}/{x}/{y}.png         ← XYZ map tiles
│       ├── health-maps/
│       │   └── {health_map_id}/
│       │       └── {z}/{x}/{y}.png         ← NDVI/stress tiles
│       ├── vector-layers/
│       │   └── {layer_id}.geojson          ← GeoJSON polygons
│       ├── raw-images/
│       │   └── {image_id}.{ext}            ← Uploaded drone images
│       ├── predictions/
│       │   └── {prediction_id}.png         ← ML model outputs
│       ├── reports/
│       │   └── {file_id}.pdf               ← PDF reports
│       ├── maps/
│       │   └── {file_id}.{ext}             ← HD maps, orthomosaics
│       └── models/
│           └── {file_id}.{ext}             ← 3D models
└── system/
    └── thumbnails/
        └── {file_id}_thumb.jpg             ← Auto-generated thumbnails
```

### Key Design Decisions
- **Course-scoped**: Everything lives under `courses/{golf_course_id}/`. This makes RLS enforcement trivial and deletion clean.
- **Type-separated**: Each asset type has its own subdirectory, preventing naming collisions.
- **Flat within type**: Within each type directory, files are identified by their UUID. No nested subdirectories beyond the XYZ tile structure.

---

## 8. Phase 6: Testing & Verification

### Automated Tests
```bash
# TypeScript compilation check
npx tsc --noEmit

# Production build
npm run build

# Lint
npm run lint
```

### Browser Test Matrix

| Test | Expected Result |
|---|---|
| Open login page | Vista UI renders, dark theme, premium look |
| Sign up as admin | Account created, approved by default |
| Sign up as client | Account created, pending admin approval |
| Admin approves client | Client gains access to assigned course |
| Client views dashboard | Only sees their assigned course(s) |
| Map viewer loads | Mapbox renders with satellite imagery |
| Tile overlay loads | Custom tilesets render from R2 via tile-proxy |
| Vector layer toggle | GeoJSON polygons render on map |
| Health map toggle | NDVI overlay renders |
| Dual map swipe | Side-by-side comparison works |
| Upload images (client) | Files upload to R2, processing job queued |
| Upload images (admin) | Same flow works for admin |
| View reports | PDF viewer renders content from R2 |
| Content file browser | Files listed, downloadable |
| Sign out | Session cleared, redirected to login |

### Security Tests

| Test | Expected Result |
|---|---|
| Unapproved client tries to view files | Empty results |
| Suspended client tries to access | Blocked |
| Client tries to access another course's data | RLS blocks |
| Anonymous request to tile-proxy | Tiles still serve (JWT disabled by design) |
| Anonymous request to r2-download | Content serves (JWT disabled by design) |
| Anonymous request to r2-upload | Blocked (JWT required) |

---

## Appendix A: Full Table Schemas

*(Detailed column-level schemas are provided in Phase 2 above)*

## Appendix B: Edge Function Inventory

### Final Function Count: ~20 functions

| # | Function | Source | JWT |
|---|---|---|---|
| 1 | `r2-upload` | Vista | ✅ |
| 2 | `r2-direct-upload` | Vista | ✅ |
| 3 | `r2-download` | Vista | ❌ |
| 4 | `r2-delete` | Vista | ✅ |
| 5 | `r2-complete` | Vista | ✅ |
| 6 | `r2-presign` | Vista + Demo `r2-sign` | ✅ |
| 7 | `r2-list-folders` | Vista | ✅ |
| 8 | `r2-register` | Vista | ✅ |
| 9 | `r2-assign-tilemap` | Vista | ✅ |
| 10 | `extract-zip-tiles` | Vista | ✅ |
| 11 | `tile-proxy` | Vista (v106) | ❌ |
| 12 | `create-client-user` | Vista | ✅ |
| 13 | `get-mapbox-token` | Vista | ✅ |
| 14 | `get-secure-mapbox-config` | Vista | ✅ |
| 15 | `process-image` | Demo (adapted) | ✅ |
| 16 | `analyse-image` | Demo (adapted) | ✅ |
| 17 | `model-inference` | Demo (adapted) | ✅ |
| 18 | `upload-vector-layer` | Demo (adapted) | ✅ |
| 19 | `get-vector-layers` | Demo (adapted) | ✅ |
| 20 | `manage-client-courses` | Demo (adapted) | ✅ |
| 21 | `delete-user` | Demo (adapted) | ✅ |

---

> **Next Step**: Once you have the new Supabase project credentials and R2 bucket details, share them and we'll begin Phase 1 (scaffolding).
