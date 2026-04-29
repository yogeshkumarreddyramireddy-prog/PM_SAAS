import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, BarChart2, Play, Download, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { R2Service } from '@/lib/r2Service';
import { COGLoader } from '@/lib/cog-loader';
import type { GolfCourseTileset } from '@/lib/tilesetService';
import {
  VEGETATION_INDEX_CONFIG,
  type VegetationIndex,
} from '@/lib/vegetation-indices';
import type { Annotation } from '@/types/annotation';
import {
  computeZonalStats,
  reprojectPolygon,
  roundTo,
  ALL_METRICS,
  METRIC_LABELS,
  type MetricKey,
  type BandMapping,
} from '@/lib/zonalStats';
import type { Polygon, MultiPolygon } from 'geojson';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Which indices are compatible with a given band count */
function compatibleIndices(bandCount: number): VegetationIndex[] {
  if (bandCount <= 0) return [];
  if (bandCount === 3) {
    return ['RGB_GLI', 'RGB_VARI', 'RGB_TGI', 'RGB_GRVI'];
  }
  // 4-band: R, G, NIR, RE — no RedEdge-dependent indices
  if (bandCount === 4) {
    return ['MS_NDVI', 'MS_GNDVI', 'MS_MSAVI2', 'MS_OSAVI', 'MS_NDWI'];
  }
  // 5-band: all MS indices available
  return ['MS_NDVI', 'MS_NDRE', 'MS_GNDVI', 'MS_MSAVI2', 'MS_OSAVI', 'MS_NDWI', 'MS_CLRE'];
}

function isCogTileset(ts: GolfCourseTileset): boolean {
  return ts.format === 'cog' || !!((ts as any).cog_source_key);
}

function formatDate(ts: GolfCourseTileset): string {
  return (ts as any).flight_date || (ts as any).analysis_date || ts.name || ts.id.slice(0, 8);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LayerConfig {
  tileset: GolfCourseTileset;
  bandCount: number;   // 0 = not yet loaded
  loading: boolean;
  error: string | null;
  selectedIndices: Set<VegetationIndex>;
}

interface ResultRow {
  plot_id: string;
  external_code: string;
  comment: string;
  annotation_type: string;
  // key = `${layerId}__${index}__${metric}`
  [key: string]: string | number;
}

interface RunProgress {
  done: number;
  total: number;
  currentLabel: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ZonalStatsPanelProps {
  golfCourseId: string;
  tilesets: GolfCourseTileset[];
  annotations: Annotation[];
  bandMapping: BandMapping;
  onClose: () => void;
}

export const ZonalStatsPanel: React.FC<ZonalStatsPanelProps> = ({
  golfCourseId,
  tilesets,
  annotations,
  bandMapping,
  onClose,
}) => {
  // ── Eligible annotations (polygons only) ──────────────────────────────────
  const eligibleAnnotations = annotations.filter(
    a => a.annotation_type === 'area' || a.annotation_type === 'plot_grid'
  );

  // ── Eligible COG tilesets ─────────────────────────────────────────────────
  const cogTilesets = tilesets.filter(isCogTileset);

  // ── Layer configs (selected + index choices per layer) ────────────────────
  const [layerConfigs, setLayerConfigs] = useState<Map<string, LayerConfig>>(() => {
    const m = new Map<string, LayerConfig>();
    cogTilesets.forEach(ts => {
      m.set(ts.id, {
        tileset: ts,
        bandCount: 0,
        loading: false,
        error: null,
        selectedIndices: new Set(),
      });
    });
    return m;
  });

  // Which layer IDs the user has checked
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set());

  // ── Metrics checkboxes ────────────────────────────────────────────────────
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(
    new Set(ALL_METRICS)
  );

  // ── Export format ─────────────────────────────────────────────────────────
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  // ── Run state ─────────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  // abort flag
  const abortRef = useRef(false);

  // ── Section collapse state ────────────────────────────────────────────────
  const [showLayers, setShowLayers] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);

  // ── Handlers: layer toggle ────────────────────────────────────────────────

  const handleLayerToggle = useCallback(async (tsId: string, checked: boolean) => {
    setSelectedLayerIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(tsId); else next.delete(tsId);
      return next;
    });

    if (!checked) return;

    // Probe band count if not yet loaded
    const cfg = layerConfigs.get(tsId);
    if (!cfg || cfg.bandCount > 0 || cfg.loading) return;

    setLayerConfigs(prev => {
      const next = new Map(prev);
      next.set(tsId, { ...cfg, loading: true, error: null });
      return next;
    });

    try {
      const cogKey = (cfg.tileset as any).cog_source_key as string;
      const { url } = await R2Service.getGetUrl(cogKey, 4 * 3600);
      const loader = new COGLoader(url);
      await loader.init();
      const bc = loader.getBandCount();
      const compatible = compatibleIndices(bc);
      // Default: select the first index automatically
      const defaultSelected = new Set<VegetationIndex>(
        compatible.length > 0 ? [compatible[0]] : []
      );

      setLayerConfigs(prev => {
        const next = new Map(prev);
        next.set(tsId, {
          ...cfg,
          bandCount: bc,
          loading: false,
          error: null,
          selectedIndices: defaultSelected,
        });
        return next;
      });
    } catch (err) {
      setLayerConfigs(prev => {
        const next = new Map(prev);
        next.set(tsId, {
          ...cfg,
          loading: false,
          error: 'Could not load layer metadata',
        });
        return next;
      });
    }
  }, [layerConfigs]);

  const handleIndexToggle = useCallback((tsId: string, idx: VegetationIndex, checked: boolean) => {
    setLayerConfigs(prev => {
      const cfg = prev.get(tsId);
      if (!cfg) return prev;
      const next = new Set(cfg.selectedIndices);
      if (checked) next.add(idx); else next.delete(idx);
      const next2 = new Map(prev);
      next2.set(tsId, { ...cfg, selectedIndices: next });
      return next2;
    });
  }, []);

  const handleMetricToggle = useCallback((m: MetricKey, checked: boolean) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (checked) next.add(m); else next.delete(m);
      return next;
    });
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const canRun = (
    eligibleAnnotations.length > 0 &&
    selectedLayerIds.size > 0 &&
    selectedMetrics.size > 0 &&
    Array.from(selectedLayerIds).every(id => {
      const cfg = layerConfigs.get(id);
      return cfg && cfg.selectedIndices.size > 0 && !cfg.loading && !cfg.error;
    })
  );

  // ── Run ───────────────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setResults(null);
    setSavedFileName(null);
    abortRef.current = false;

    const selectedLayerList = Array.from(selectedLayerIds);
    const totalSteps = eligibleAnnotations.length * selectedLayerList.length;
    let done = 0;

    // One COGLoader per selected layer (keyed by tileset id)
    const loaders = new Map<string, { loader: COGLoader; url: string }>();

    try {
      // Initialise loaders for all selected layers
      for (const tsId of selectedLayerList) {
        const cfg = layerConfigs.get(tsId)!;
        const cogKey = (cfg.tileset as any).cog_source_key as string;
        const { url } = await R2Service.getGetUrl(cogKey, 4 * 3600);
        const loader = new COGLoader(url);
        await loader.init();
        loaders.set(tsId, { loader, url });
      }

      // Result accumulator: one entry per annotation
      const rowMap = new Map<string, ResultRow>();

      for (const ann of eligibleAnnotations) {
        if (abortRef.current) break;

        const geom = ann.geometry as Polygon | MultiPolygon;
        if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') continue;

        const plotId = ann.plot_id ?? ann.id.slice(0, 8);

        // Ensure row exists
        if (!rowMap.has(ann.id)) {
          rowMap.set(ann.id, {
            plot_id: plotId,
            external_code: ann.external_code ?? '',
            comment: ann.comment ?? '',
            annotation_type: ann.annotation_type,
          });
        }
        const row = rowMap.get(ann.id)!;

        for (const tsId of selectedLayerList) {
          if (abortRef.current) break;

          const cfg = layerConfigs.get(tsId)!;
          const { loader } = loaders.get(tsId)!;
          const layerLabel = `${formatDate(cfg.tileset)}`;

          setProgress({
            done,
            total: totalSteps,
            currentLabel: `${plotId} · ${layerLabel}`,
          });

          // Compute bbox for this annotation
          const coords: number[][] = [];
          const collectCoords = (geom: Polygon | MultiPolygon) => {
            if (geom.type === 'Polygon') geom.coordinates.forEach(r => coords.push(...r));
            else geom.coordinates.forEach(p => p.forEach(r => coords.push(...r)));
          };
          collectCoords(geom);
          const lons = coords.map(c => c[0]);
          const lats = coords.map(c => c[1]);
          const bbox: [number, number, number, number] = [
            Math.min(...lons), Math.min(...lats),
            Math.max(...lons), Math.max(...lats),
          ];

          // Read full-res window
          const windowData = await loader.readWindowRaw(bbox);
          if (!windowData) {
            done++;
            continue;
          }

          // Reproject polygon to native CRS (once per annotation×layer)
          const projectFn = loader.getProjectFn();
          const nativeGeom = projectFn
            ? reprojectPolygon(geom, projectFn)
            : geom;

          // Compute stats for each selected index in one pass
          for (const indexKey of cfg.selectedIndices) {
            const indexCfg = VEGETATION_INDEX_CONFIG[indexKey];
            const result = computeZonalStats(
              windowData,
              nativeGeom as Polygon | MultiPolygon,
              bandMapping,
              indexCfg.calculate,
              selectedMetrics
            );

            const colPrefix = `${tsId}__${indexKey}`;
            if (result) {
              for (const m of selectedMetrics) {
                row[`${colPrefix}__${m}`] = roundTo(result[m]);
              }
            } else {
              for (const m of selectedMetrics) {
                row[`${colPrefix}__${m}`] = 'N/A';
              }
            }
          }

          done++;
        }
      }

      setProgress({ done: totalSteps, total: totalSteps, currentLabel: 'Done' });
      setResults(Array.from(rowMap.values()));
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [eligibleAnnotations, selectedLayerIds, layerConfigs, bandMapping, selectedMetrics]);

  // ── Export & Save ─────────────────────────────────────────────────────────

  const buildWorkbook = useCallback(() => {
    if (!results) return null;

    const selectedLayerList = Array.from(selectedLayerIds);

    // ── Build header rows (2-level: layer group + index+metric) ──────────────
    // Row 1: plot metadata cols (merged) + layer display name (merged over index×metric cols)
    // Row 2: plot_id / external_code / comment / annotation_type  + {INDEX}_{METRIC}

    const metaCols = ['plot_id', 'external_code', 'comment', 'annotation_type'];
    const metaLabels = ['Plot ID', 'External Code', 'Comment', 'Type'];

    // Ordered columns per layer: index1_metric1, index1_metric2, ..., index2_metric1, ...
    type ColDef = { tsId: string; layerLabel: string; indexKey: VegetationIndex; indexLabel: string; metric: MetricKey };
    const dataCols: ColDef[] = [];

    for (const tsId of selectedLayerList) {
      const cfg = layerConfigs.get(tsId);
      if (!cfg) continue;
      const layerLabel = formatDate(cfg.tileset);
      for (const indexKey of cfg.selectedIndices) {
        const indexLabel = VEGETATION_INDEX_CONFIG[indexKey].name;
        for (const m of ALL_METRICS) {
          if (!selectedMetrics.has(m)) continue;
          dataCols.push({ tsId, layerLabel, indexKey, indexLabel, metric: m });
        }
      }
    }

    // Header row 1: empty for meta cols, layer label spanning each layer's columns
    const header1: string[] = [...metaLabels];
    // Header row 2: sub-labels
    const header2: string[] = [...metaLabels];
    for (const col of dataCols) {
      // Row 1: layer label (will be merged in XLSX)
      header1.push(`${col.layerLabel} — ${VEGETATION_INDEX_CONFIG[col.indexKey].name}`);
      // Row 2: metric label
      header2.push(METRIC_LABELS[col.metric]);
    }

    // Data rows
    const dataRows = results.map(row => {
      const cells: (string | number)[] = [
        row.plot_id as string,
        row.external_code as string,
        row.comment as string,
        row.annotation_type as string,
      ];
      for (const col of dataCols) {
        const key = `${col.tsId}__${col.indexKey}__${col.metric}`;
        const val = row[key];
        cells.push(val !== undefined ? val : 'N/A');
      }
      return cells;
    });

    const aoa = [header1, header2, ...dataRows];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Freeze first row and first 4 columns for readability
    ws['!freeze'] = { xSplit: 4, ySplit: 2 };

    // Column widths
    const colWidths = [
      { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
      ...dataCols.map(() => ({ wch: 12 })),
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Zonal Statistics');
    return wb;
  }, [results, selectedLayerIds, layerConfigs, selectedMetrics]);

  const handleDownload = useCallback(() => {
    const wb = buildWorkbook();
    if (!wb) return;
    const now = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    if (exportFormat === 'xlsx') {
      XLSX.writeFile(wb, `zonal-stats-${now}.xlsx`);
    } else {
      // CSV: flatten to single sheet
      const ws = wb.Sheets[wb.SheetNames[0]];
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `zonal-stats-${now}.csv`;
      a.click();
    }
  }, [buildWorkbook, exportFormat]);

  const handleSaveToReports = useCallback(async () => {
    const wb = buildWorkbook();
    if (!wb) return;
    setSaving(true);
    setRunError(null);

    try {
      const now = new Date();
      const stamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
      const ext = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
      const filename = `zonal-stats-${stamp}.${ext}`;

      let fileBuffer: ArrayBuffer;
      let mimeType: string;

      if (exportFormat === 'xlsx') {
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        fileBuffer = buf;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        fileBuffer = new TextEncoder().encode(csv).buffer;
        mimeType = 'text/csv';
      }

      // Derive course name from any tileset's r2_folder_path
      const anyTs = cogTilesets[0];
      const courseName = anyTs ? (anyTs.r2_folder_path || '').split('/')[0] || 'course' : 'course';
      const r2Key = `${courseName}/reports/${filename}`;

      // Upload to R2
      const blob = new Blob([fileBuffer], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType });
      await R2Service.uploadFile(r2Key, file);

      // Register in content_files
      const allIndices = Array.from(selectedLayerIds).flatMap(id => {
        const cfg = layerConfigs.get(id);
        return cfg ? Array.from(cfg.selectedIndices) : [];
      });
      const layerNames = Array.from(selectedLayerIds).map(id => {
        const cfg = layerConfigs.get(id);
        return cfg ? formatDate(cfg.tileset) : id;
      });

      await (supabase as any).from('content_files').insert({
        golf_course_id: Number(golfCourseId),
        filename,
        original_filename: filename,
        file_path: r2Key,
        r2_object_key: r2Key,
        file_category: 'reports',
        file_extension: ext,
        file_size: fileBuffer.byteLength,
        mime_type: mimeType,
        status: 'active',
        metadata: {
          report_type: 'zonal_statistics',
          indices: allIndices,
          layers: layerNames,
          annotation_count: eligibleAnnotations.length,
          generated_at: now.toISOString(),
        },
      });

      setSavedFileName(filename);
    } catch (err) {
      setRunError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [buildWorkbook, exportFormat, golfCourseId, cogTilesets, selectedLayerIds, layerConfigs, eligibleAnnotations.length]);

  // ── Preview table (first 5 rows) ──────────────────────────────────────────

  const previewRows = results?.slice(0, 5) ?? [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <BarChart2 className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-base">Zonal Statistics</h2>
            {eligibleAnnotations.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {eligibleAnnotations.length} zone{eligibleAnnotations.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-5">

            {/* No annotations warning */}
            {eligibleAnnotations.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                No area or plot-grid annotations found. Draw some zones on the map first.
              </div>
            )}

            {/* No COG layers warning */}
            {cogTilesets.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                No multispectral / COG raster layers found for this course.
              </div>
            )}

            {/* ── Section 1: Raster layers + indices ── */}
            {cogTilesets.length > 0 && (
              <section>
                <button
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setShowLayers(v => !v)}
                >
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Raster Layers &amp; Indices
                  </span>
                  {showLayers ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {showLayers && (
                  <div className="mt-3 space-y-3">
                    {cogTilesets.map(ts => {
                      const cfg = layerConfigs.get(ts.id)!;
                      const isSelected = selectedLayerIds.has(ts.id);
                      const compat = compatibleIndices(cfg.bandCount);

                      return (
                        <div
                          key={ts.id}
                          className={cn(
                            'rounded-lg border transition-colors',
                            isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'
                          )}
                        >
                          {/* Layer row */}
                          <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={checked => handleLayerToggle(ts.id, !!checked)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{ts.name}</div>
                              <div className="text-xs text-muted-foreground">{formatDate(ts)}</div>
                            </div>
                            {cfg.loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                            {cfg.error && (
                              <span className="text-xs text-destructive">{cfg.error}</span>
                            )}
                            {cfg.bandCount > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                {cfg.bandCount}B
                              </Badge>
                            )}
                          </label>

                          {/* Index pills — only shown when selected and band count known */}
                          {isSelected && cfg.bandCount > 0 && (
                            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                              {compat.map(idx => {
                                const active = cfg.selectedIndices.has(idx);
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleIndexToggle(ts.id, idx, !active)}
                                    className={cn(
                                      'text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors',
                                      active
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                                    )}
                                  >
                                    {VEGETATION_INDEX_CONFIG[idx].id.replace(/^(RGB_|MS_)/, '')}
                                  </button>
                                );
                              })}
                              {cfg.selectedIndices.size === 0 && (
                                <span className="text-xs text-destructive">Select at least one index</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ── Section 2: Metrics ── */}
            <section>
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setShowMetrics(v => !v)}
              >
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Metrics
                </span>
                {showMetrics ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>

              {showMetrics && (
                <div className="mt-3 grid grid-cols-4 gap-x-4 gap-y-2">
                  {ALL_METRICS.map(m => (
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedMetrics.has(m)}
                        onCheckedChange={checked => handleMetricToggle(m, !!checked)}
                      />
                      <span className="text-sm">{METRIC_LABELS[m]}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* ── Section 3: Export format ── */}
            <section>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-3">
                Export Format
              </span>
              <div className="flex gap-3">
                {(['xlsx', 'csv'] as const).map(fmt => (
                  <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="exportFormat"
                      value={fmt}
                      checked={exportFormat === fmt}
                      onChange={() => setExportFormat(fmt)}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium">{fmt === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* ── Run error ── */}
            {runError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {runError}
              </div>
            )}

            {/* ── Progress ── */}
            {running && progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {progress.currentLabel}
                  </span>
                  <span className="font-medium tabular-nums">
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-200"
                    style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Results preview ── */}
            {results && results.length > 0 && (
              <section>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-3">
                  Preview (first 5 rows)
                </span>
                <div className="overflow-x-auto rounded-lg border border-border text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Plot ID</th>
                        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Type</th>
                        {Array.from(selectedLayerIds).flatMap(tsId => {
                          const cfg = layerConfigs.get(tsId);
                          if (!cfg) return [];
                          return Array.from(cfg.selectedIndices).flatMap(idx =>
                            Array.from(selectedMetrics).map(m => (
                              <th key={`${tsId}_${idx}_${m}`} className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                                {VEGETATION_INDEX_CONFIG[idx].id.replace(/^(RGB_|MS_)/, '')}_{METRIC_LABELS[m].replace(' ', '')}
                              </th>
                            ))
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <td className="px-2 py-1 whitespace-nowrap font-mono">{row.plot_id as string}</td>
                          <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{row.annotation_type as string}</td>
                          {Array.from(selectedLayerIds).flatMap(tsId => {
                            const cfg = layerConfigs.get(tsId);
                            if (!cfg) return [];
                            return Array.from(cfg.selectedIndices).flatMap(idx =>
                              Array.from(selectedMetrics).map(m => {
                                const key = `${tsId}__${idx}__${m}`;
                                const val = row[key];
                                return (
                                  <td key={key} className="px-2 py-1 text-right tabular-nums font-mono">
                                    {val !== undefined ? String(val) : '—'}
                                  </td>
                                );
                              })
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {results.length > 5 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    … and {results.length - 5} more rows in the export.
                  </p>
                )}
              </section>
            )}

            {/* Save success */}
            {savedFileName && (
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Saved to Reports: <span className="font-mono font-medium">{savedFileName}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-3 shrink-0 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {eligibleAnnotations.length} zone{eligibleAnnotations.length !== 1 ? 's' : ''} · {selectedLayerIds.size} layer{selectedLayerIds.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-2">
            {results && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToReports}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Save to Reports
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!canRun || running}
              className="gap-1.5 min-w-[90px]"
            >
              {running
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
                : <><Play className="w-3.5 h-3.5" /> Run</>
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
