import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { COGLoader } from '@/lib/cog-loader';
import { VEGETATION_INDEX_CONFIG, type VegetationIndex } from '@/lib/vegetation-indices';
import type { BandMapping } from '@/lib/zonalStats';

interface TooltipState {
  x: number;
  y: number;
  value: number | null;
  loading: boolean;
}

interface PixelInspectorTooltipProps {
  map: mapboxgl.Map | null;
  isActive: boolean;
  cogUrl: string | null;         // presigned URL for the active COG layer
  selectedIndex: VegetationIndex;
  bandMapping: BandMapping;
}

// Module-level loader cache keyed by URL — avoids re-initialising on every click
const loaderCache = new Map<string, COGLoader>();

export function PixelInspectorTooltip({
  map,
  isActive,
  cogUrl,
  selectedIndex,
  bandMapping,
}: PixelInspectorTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getOrCreateLoader = useCallback((url: string): COGLoader => {
    if (!loaderCache.has(url)) loaderCache.set(url, new COGLoader(url));
    return loaderCache.get(url)!;
  }, []);

  const handleClick = useCallback(
    async (e: mapboxgl.MapMouseEvent) => {
      if (!cogUrl) return;

      const { x, y } = e.point;
      const { lng, lat } = e.lngLat;

      setTooltip({ x, y, value: null, loading: true });

      try {
        const loader = getOrCreateLoader(cogUrl);
        await loader.init();

        const rawBands = await loader.getPixelAt(lng, lat);
        if (!rawBands) {
          setTooltip(prev => prev ? { ...prev, loading: false, value: null } : null);
          return;
        }

        const r = rawBands[bandMapping.r] ?? 0;
        const g = rawBands[bandMapping.g] ?? 0;
        const b = rawBands[bandMapping.b] ?? 0;
        const n = rawBands[bandMapping.nir] ?? 0;
        const e = rawBands[bandMapping.re] ?? 0;

        const value = VEGETATION_INDEX_CONFIG[selectedIndex].calculate(r, g, b, n, e);

        setTooltip({ x, y, value: isFinite(value) ? value : null, loading: false });
      } catch {
        setTooltip(prev => prev ? { ...prev, loading: false, value: null } : null);
      }
    },
    [cogUrl, bandMapping, selectedIndex, getOrCreateLoader]
  );

  // Dismiss tooltip on map move (drag)
  const handleMoveStart = useCallback(() => {
    setTooltip(null);
  }, []);

  useEffect(() => {
    if (!map || !isActive) {
      setTooltip(null);
      return;
    }

    map.on('click', handleClick);
    map.on('movestart', handleMoveStart);

    // Show crosshair cursor while inspector is active
    map.getCanvas().style.cursor = 'crosshair';

    return () => {
      map.off('click', handleClick);
      map.off('movestart', handleMoveStart);
      map.getCanvas().style.cursor = '';
    };
  }, [map, isActive, handleClick, handleMoveStart]);

  if (!isActive || !tooltip) return null;

  const indexName = VEGETATION_INDEX_CONFIG[selectedIndex].id.replace(/^(RGB_|MS_)/, '');
  const displayValue = tooltip.loading
    ? '…'
    : tooltip.value === null
    ? 'No data'
    : tooltip.value.toFixed(4);

  // Keep tooltip inside viewport
  const mapRect = map?.getCanvas().getBoundingClientRect();
  const offsetX = mapRect ? tooltip.x + mapRect.left : tooltip.x;
  const offsetY = mapRect ? tooltip.y + mapRect.top : tooltip.y;

  // Flip left when close to right edge
  const flipLeft = offsetX > window.innerWidth - 180;
  const translateX = flipLeft ? 'calc(-100% - 12px)' : '12px';
  const translateY = '-50%';

  return (
    <div
      ref={containerRef}
      className="fixed z-[9999] pointer-events-none"
      style={{ left: offsetX, top: offsetY, transform: `translate(${translateX}, ${translateY})` }}
    >
      <div className="bg-background/95 backdrop-blur border border-border rounded-lg shadow-lg px-3 py-2 text-xs font-mono min-w-[120px]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
          {indexName}
        </div>
        <div className={`text-base font-semibold tabular-nums ${tooltip.value === null && !tooltip.loading ? 'text-muted-foreground' : 'text-foreground'}`}>
          {displayValue}
        </div>
      </div>
    </div>
  );
}
