#!/usr/bin/env python3
"""
Extract geospatial metadata from a GeoTIFF file.
Outputs JSON with bounds, center, zoom levels, and CRS info.
"""

import json
import sys
import subprocess
import math


def get_zoom_for_resolution(resolution_deg):
    """Estimate appropriate zoom level based on pixel resolution in degrees."""
    # At zoom 0, one pixel covers ~360/256 degrees
    # At zoom z, one pixel covers ~360/(256 * 2^z) degrees
    if resolution_deg <= 0:
        return 20
    zoom = math.log2(360 / (256 * resolution_deg))
    return max(0, min(22, int(zoom)))


def main():
    if len(sys.argv) < 2:
        print("Usage: extract_metadata.py <input.tif>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]

    # Run gdalinfo -json
    result = subprocess.run(
        ["gdalinfo", "-json", input_file],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"gdalinfo failed: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    info = json.loads(result.stdout)

    # Extract CRS
    crs = info.get("coordinateSystem", {}).get("wkt", "")
    is_geographic = "GEOGCS" in crs or "4326" in crs
    needs_reproject = not is_geographic

    # Get corner coordinates
    corners = info.get("cornerCoordinates", {})

    if needs_reproject:
        # Use gdalinfo with -proj4 to get bounds in EPSG:4326
        result_wgs84 = subprocess.run(
            ["gdalsrsinfo", "-o", "proj4", input_file],
            capture_output=True, text=True
        )

        # For reprojection, we need to get WGS84 bounds via gdalwarp dry-run
        result_te = subprocess.run(
            ["gdalwarp", "-t_srs", "EPSG:4326", "-te_srs", "EPSG:4326",
             input_file, "/dev/null", "--dry-run"],
            capture_output=True, text=True
        )

        # Fallback: use cornerCoordinates which may be in projected CRS
        # The actual reprojection will happen in the workflow
        upper_left = corners.get("upperLeft", [0, 0])
        lower_right = corners.get("lowerRight", [0, 0])

        # These might not be in degrees yet, but we'll reproject in the workflow
        min_lon = upper_left[0]
        max_lat = upper_left[1]
        max_lon = lower_right[0]
        min_lat = lower_right[1]
    else:
        upper_left = corners.get("upperLeft", [0, 0])
        lower_right = corners.get("lowerRight", [0, 0])

        min_lon = upper_left[0]
        max_lat = upper_left[1]
        max_lon = lower_right[0]
        min_lat = lower_right[1]

    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2

    # Get pixel resolution
    geo_transform = info.get("geoTransform", [0, 1, 0, 0, 0, -1])
    pixel_width = abs(geo_transform[1])
    pixel_height = abs(geo_transform[5])
    resolution = min(pixel_width, pixel_height)

    # Calculate zoom levels
    if is_geographic:
        max_zoom = min(get_zoom_for_resolution(resolution), 22)
    else:
        # For projected CRS, estimate from meter-based resolution
        # Approximate: 1 degree ≈ 111320 meters at equator
        resolution_deg = resolution / 111320.0
        max_zoom = min(get_zoom_for_resolution(resolution_deg), 22)

    min_zoom = max(0, max_zoom - 6)  # Typically 6 levels below max

    # Clamp to reasonable range for golf courses
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
