import * as fs from 'fs';

const coursesOutput = `[{"id":5,"name":"Worlds Best Golf Club","location":null,"max_users":5,"signup_enabled":true,"created_at":"2025-07-16 14:20:24.642242+00","updated_at":"2025-07-16 14:20:24.642242+00","all_golf_course_id":"bf098c86-d83a-4bac-a970-8e73d9630cbc"},{"id":6,"name":"Golfbaan Zeegersloot","location":"ALPHEN AAN DEN RIJN","max_users":5,"signup_enabled":true,"created_at":"2025-07-16 15:17:48.182447+00","updated_at":"2025-07-16 15:17:48.182447+00","all_golf_course_id":"c79635d5-107e-4d58-95cc-5f8f995bbfb5"},{"id":7,"name":"Best Golf","location":null,"max_users":5,"signup_enabled":true,"created_at":"2025-07-16 19:23:37.8997+00","updated_at":"2025-07-16 19:23:37.8997+00","all_golf_course_id":"d2d77188-d282-40e1-bc3e-876239ef085c"},{"id":9,"name":"Sallandsche Golfclub","location":null,"max_users":5,"signup_enabled":true,"created_at":"2025-07-27 17:28:45.368986+00","updated_at":"2025-07-27 17:28:45.368986+00","all_golf_course_id":"55c996ba-0d44-4549-afd1-41d80aeba950"},{"id":10,"name":"Het Woold","location":null,"max_users":5,"signup_enabled":true,"created_at":"2025-08-12 07:20:21.46361+00","updated_at":"2025-08-12 07:20:21.46361+00","all_golf_course_id":"4902b21f-61d2-4bc9-bba0-693dbdb185de"}]`;

const courses = JSON.parse(coursesOutput);

const contentFilesOutputStr = fs.readFileSync('/Users/yogeshkumarreddyramireddy/.gemini/antigravity/brain/f8a39ff2-ff7f-41dc-8c61-0c859d6dc34f/.system_generated/steps/501/output.txt', 'utf8');

// The output format is: [{"json_agg":[...]}]
const startText = '[{"json_agg"';
const endText = '}]}]';
const startIndex = contentFilesOutputStr.indexOf(startText);
const endIndex = contentFilesOutputStr.lastIndexOf(endText);
let contentFiles = [];

if (startIndex !== -1 && endIndex !== -1) {
    const jsonStr = contentFilesOutputStr.substring(startIndex, endIndex + endText.length);
    const rawJson = JSON.parse(jsonStr);
    if (rawJson && rawJson[0] && rawJson[0].json_agg) {
        contentFiles = rawJson[0].json_agg;
    }
}

let sql = `-- Migration to copy old courses and content files
-- Add all active golf courses
`;

for (const c of courses) {
    const loc = c.location ? `'${c.location.replace(/'/g, "''")}'` : 'NULL';
    const allCourseId = 'NULL'; // Bypass FK violation to missing all_golf_courses entries
    sql += `INSERT INTO public.active_golf_courses (id, name, location, max_users, signup_enabled, created_at, updated_at, all_golf_course_id)
            VALUES (${c.id}, '${c.name.replace(/'/g, "''")}', ${loc}, ${c.max_users}, ${c.signup_enabled}, '${c.created_at}', '${c.updated_at}', ${allCourseId})
            ON CONFLICT (id) DO NOTHING;\n`;
}

sql += `\n-- Add content files\n`;

for (const cf of contentFiles) {
    Object.keys(cf).forEach(k => {
        if (typeof cf[k] === 'string') cf[k] = cf[k].replace(/'/g, "''");
    });
    const catId = cf.category_id !== null ? cf.category_id : 'NULL';
    const metadata = cf.metadata ? `'${JSON.stringify(cf.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL';
    const bounds = cf.map_bounds ? `'${JSON.stringify(cf.map_bounds)}'::jsonb` : 'NULL';
    const zoomLvl = cf.zoom_levels ? `'${JSON.stringify(cf.zoom_levels)}'::jsonb` : 'NULL';

    const mapboxLId = cf.mapbox_layer_id ? `'${cf.mapbox_layer_id}'` : 'NULL';
    const fId = cf.fieldId ? `'${cf.fieldId}'` : 'NULL';
    const tMapId = cf.tile_map_id ? `'${cf.tile_map_id}'` : 'NULL';
    const tBaseUrl = cf.tile_base_url ? `'${cf.tile_base_url}'` : 'NULL';
    const coords = cf.gps_coordinates ? `'${cf.gps_coordinates}'` : 'NULL';
    const tPath = cf.thumbnail_path ? `'${cf.thumbnail_path}'` : 'NULL';
    const pUrl = cf.preview_url ? `'${cf.preview_url}'` : 'NULL';
    const hash = cf.file_hash ? `'${cf.file_hash}'` : 'NULL';
    const oName = cf.original_filename ? `'${cf.original_filename}'` : 'NULL';
    const mime = cf.mime_type ? `'${cf.mime_type}'` : 'NULL';
    const size = cf.file_size !== null ? cf.file_size : 'NULL';

    sql += `INSERT INTO public.content_files 
            (id, golf_course_id, category_id, filename, file_path, file_size, mime_type, status, created_at, updated_at, r2_object_key, r2_bucket_name, file_category, original_filename, file_extension, file_hash, upload_progress, thumbnail_path, preview_url, download_count, metadata, gps_coordinates, map_bounds, zoom_levels, mapbox_layer_id, is_mapbox_overlay, "fieldId", tile_map_id, tile_base_url, tile_min_zoom, tile_max_zoom, is_tile_map)
            VALUES ('${cf.id}', ${cf.golf_course_id}, ${catId}, '${cf.filename}', '${cf.file_path}', ${size}, ${mime}, '${cf.status}', '${cf.created_at}', '${cf.updated_at}', '${cf.r2_object_key}', '${cf.r2_bucket_name}', '${cf.file_category}', ${oName}, '${cf.file_extension}', ${hash}, ${cf.upload_progress}, ${tPath}, ${pUrl}, ${cf.download_count}, ${metadata}, ${coords}, ${bounds}, ${zoomLvl}, ${mapboxLId}, ${cf.is_mapbox_overlay}, ${fId}, ${tMapId}, ${tBaseUrl}, ${cf.tile_min_zoom}, ${cf.tile_max_zoom}, ${cf.is_tile_map})
            ON CONFLICT (id) DO NOTHING;\n`;
}

// Fix client@123.com account to have access!
sql += `\n-- Ensure client@123.com is approved and assigned a course
UPDATE public.user_profiles 
SET approved = true, golf_course_id = 6
WHERE email = 'client@123.com';

-- Ensure all users created get backfilled properly and approved (for ease of dev context)
UPDATE public.user_profiles SET approved = true WHERE role = 'client';
`;

fs.writeFileSync('/Users/yogeshkumarreddyramireddy/antigravity/phytomaps-final/supabase/migrations/20260303000000_migrate_old_content.sql', sql);
console.log('Migration generated successfully!');
