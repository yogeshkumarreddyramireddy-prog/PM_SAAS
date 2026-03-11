# PhytoMaps Final

A unified golf course mapping and analysis platform, merging the best of **PhytoMap Vista** (UI, auth, content management) and **Phyto Demo** (ML pipeline, advanced map layers, vector overlays).

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, RLS)
- **Storage**: Cloudflare R2
- **Maps**: Mapbox GL JS

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
src/
├── components/     # React components (UI, admin, client)
├── hooks/          # Custom hooks (useAuth, useSupabaseQuery)
├── integrations/   # Supabase client and types
├── lib/            # Utility functions and services
├── pages/          # Route-level page components
└── assets/         # Static assets

supabase/
├── functions/      # Edge Functions (R2 ops, ML pipeline, tiles)
├── migrations/     # SQL migrations
└── config.toml

docs/
└── IMPLEMENTATION_PLAN.md  # Detailed merge plan
```

## Features

- 🔐 Role-based auth (Admin/Client) with approval workflow
- 🗺️ Mapbox-powered map viewer with tile overlays
- 📊 Health map analysis (NDVI/stress layers)
- 🔲 Vector layer overlays (GeoJSON polygons)
- 🔀 Dual map comparison (swipe view)
- 📸 Drone image upload with ML processing pipeline
- 📁 Content file management (reports, maps, 3D models)
- 🛡️ Row Level Security (RLS) for complete data isolation
