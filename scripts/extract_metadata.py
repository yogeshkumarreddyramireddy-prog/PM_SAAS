#!/usr/bin/env python3
"""
Extract geospatial metadata from a GeoTIFF file.
Outputs JSON with bounds, center, zoom levels, and CRS info.
ALWAYS outputs coordinates in WGS84 (EPSG:4326) degrees.
"""

import json
import sys
import subprocess
import math


def get_zoom_for_resolution(resolution_deg):
    """Estimate appropriate zoom level based on pixel resolution in degrees."""
    if resolution_deg <= 0:
        return 20
    zoom = math.log2(360 / (256 * resolution_deg))
    return max(0, min(22, int(zoom)))


def run_cmd(args):
    result = subprocess.run(args, capture_output=True, text=True)
    return result.stdout, result.stderr, result.returncode


def main():
    if len(sys.argv) < 2:
        print("Usage: extract_metadata.py <input.tif>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]

    # Run gdalinfo -json to get full metadata
    stdout, stderr, rc = run_cmd(["gdalinfo", "-json", input_file])
    if rc != 0:
        print(f"gdalinfo failed: {stderr}", file=sys.stderr)
        sys.exit(1)

    info = json.loads(stdout)

    # Determine if the CRS is already geographic (degrees)
    crs = info.get("coordinateSystem", {}).get("wkt", "")
    is_geographic = "GEOGCS" in crs or "GEOGCRS" in crs or "4326" in crs
    needs_reproject = not is_geographic

    # ALWAYS get WGS84 bounds using gdalinfo -projwin_srs EPSG:4326
    # This is the safest approach to get lon/lat regardless of source CRS.
    stdout_wgs, stderr_wgs, rc_wgs = run_cmd([
        "gdalinfo", "-json", "-projwin_srs", "EPSG:4326", input_file
    ])

    if rc_wgs == 0:
        info_wgs = json.loads(stdout_wgs)
        corners = info_wgs.get("cornerCoordinates", {})
    else:
        # Fallback: use native corners (may be projected) and warn
        print(f"Warning: could not get WGS84 corners: {stderr_wgs}", file=sys.stderr)
        corners = info.get("cornerCoordinates", {})

    upper_left = corners.get("upperLeft", [0, 0])
    lower_right = corners.get("lowerRight", [0, 0])

    min_lon = float(upper_left[0])
    max_lat = float(upper_left[1])
    max_lon = float(lower_right[0])
    min_lat = float(lower_right[1])

    # Validate — if still in projected CRS (values > 180), force reproject
    if abs(min_lon) > 180 or abs(max_lon) > 180 or abs(min_lat) > 90 or abs(max_lat) > 90:
        print("Warning: coordinates out of WGS84 range, attempting gdalinfo with warp to get bounds", file=sys.stderr)
        # Use gdaltransform to convert the corner points
        stdout_te, _, rc_te = run_cmd([
            "gdalwarp", "-t_srs", "EPSG:4326", "-q",
            "-of", "GTiff", "-overwrite",
            input_file, "/tmp/_temp_bounds_check.tif"
        ])
        stdout_b, _, _ = run_cmd(["gdalinfo", "-json", "/tmp/_temp_bounds_check.tif"])
        if stdout_b:
            info_b = json.loads(stdout_b)
            corners_b = info_b.get("cornerCoordinates", {})
            upper_left = corners_b.get("upperLeft", [min_lon, max_lat])
            lower_right = corners_b.get("lowerRight", [max_lon, min_lat])
            min_lon = float(upper_left[0])
            max_lat = float(upper_left[1])
            max_lon = float(lower_right[0])
            min_lat = float(lower_right[1])

    # Final clamp to valid WGS84 range
    min_lon = max(-180.0, min(180.0, min_lon))
    max_lon = max(-180.0, min(180.0, max_lon))
    min_lat = max(-90.0, min(90.0, min_lat))
    max_lat = max(-90.0, min(90.0, max_lat))

    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2

    # Get pixel resolution (in native CRS units)
    geo_transform = info.get("geoTransform", [0, 1, 0, 0, 0, -1])
    pixel_width = abs(geo_transform[1])
    pixel_height = abs(geo_transform[5])
    resolution = min(pixel_width, pixel_height)

    # Convert resolution to degrees for zoom calculation
    if is_geographic:
        resolution_deg = resolution
    else:
        # Approximate: 1 degree ≈ 111320 meters at equator
        resolution_deg = resolution / 111320.0

    max_zoom = min(get_zoom_for_resolution(resolution_deg), 22)
    min_zoom = max(0, max_zoom - 6)

    # Clamp to reasonable range for aerial/drone imagery of golf courses
    min_zoom = max(min_zoom, 12)
    max_zoom = max(max_zoom, 16)
    max_zoom = min(max_zoom, 21)

    metadata = {
        "bounds": [min_lon, min_lat, max_lon, max_lat],
        "center_lat": round(center_lat, 8),
        "center_lon": round(center_lon, 8),
        "min_lat": round(min_lat, 8),
        "max_lat": round(max_lat, 8),
        "min_lon": round(min_lon, 8),
        "max_lon": round(max_lon, 8),
        "min_zoom": min_zoom,
        "max_zoom": max_zoom,
        "pixel_resolution": resolution,
        "needs_reproject": needs_reproject,
        "crs": crs[:200] if crs else "unknown",
        "size": info.get("size", [0, 0]),
        "bands": len(info.get("bands", []))
    }

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
