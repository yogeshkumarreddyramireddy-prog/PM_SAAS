import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { VEGETATION_INDEX_CONFIG, VegetationIndex } from '../lib/vegetation-indices';

interface AnalysisPanelProps {
  mapMode: 'RGB' | 'Multispectral' | 'None';
  isEnabled: boolean;
  onToggleEnable: (enabled: boolean) => void;
  selectedIndex: VegetationIndex;
  onSelectIndex: (index: VegetationIndex) => void;
  range: [number, number];
  onRangeChange: (range: [number, number]) => void;
  onHistogramData: Array<{ value: number; count: number }>;
  bandMapping: { r: number, g: number, b: number, nir: number, re: number };
  onBandMappingChange: (mapping: { r: number, g: number, b: number, nir: number, re: number }) => void;
  isAdmin?: boolean;
}

export function AnalysisPanel({
  mapMode,
  isEnabled,
  onToggleEnable,
  selectedIndex,
  onSelectIndex,
  range,
  onRangeChange,
  histogramData,
  bandMapping,
  onBandMappingChange,
  isAdmin = false
}: AnalysisPanelProps) {
  
  // Filter available indices based on the active map mode
  const availableIndices = useMemo(() => {
    if (mapMode === 'None') return [];
    return Object.values(VEGETATION_INDEX_CONFIG).filter(
      (config) => config.category === mapMode
    );
  }, [mapMode]);

  const activeConfig = VEGETATION_INDEX_CONFIG[selectedIndex];

  const updateMapping = (key: keyof typeof bandMapping, value: string) => {
    onBandMappingChange({ ...bandMapping, [key]: parseInt(value) });
  };

  // If there's no map loaded, we can return null or a disabled state.
  if (mapMode === 'None') {
    return (
      <Card className="w-full">
        <CardContent className="p-4 text-center text-muted-foreground w-72">
          Select a layer to enable Analysis
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-80 shadow-md border-border/50">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Plant Health
        </CardTitle>
        <Switch checked={isEnabled} onCheckedChange={onToggleEnable} />
      </CardHeader>
      
      {isEnabled && (
        <CardContent className="p-4 pt-2">
          {/* Index Selector */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            <span className="text-muted-foreground uppercase text-xs">Based On</span>
            <Select 
              value={selectedIndex} 
              onValueChange={(val) => onSelectIndex(val as VegetationIndex)}
            >
              <SelectTrigger className="w-[140px] h-8 bg-transparent">
                <SelectValue placeholder="Select Index" />
              </SelectTrigger>
              <SelectContent>
                {availableIndices.map((ndx) => (
                  <SelectItem key={ndx.id} value={ndx.id}>
                    {ndx.name.split(' ')[0]} {/* E.g., VARI, NDVI */}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            // The histogram is fit to the DATA (so it shows a real distribution),
            // while the colours are ABSOLUTE (range = the index's colorRange) so a
            // given value always maps to the same colour and high values never go
            // red. The slider track spans the UNION of the data range and the
            // colour range — that way the colour handles always sit inside the
            // track (no clamping), so dragging is smooth instead of snapping the
            // value when a handle was off the end (the cause of the "tiny move →
            // whole map flips" jump). The histogram is positioned by VALUE inside
            // that track and coloured by the absolute ramp, so chart = map.
            let dMin = activeConfig.colorRange[0];
            let dMax = activeConfig.colorRange[1];
            if (histogramData.length > 0) {
              const minV = Math.min(...histogramData.map(d => d.value));
              const maxV = Math.max(...histogramData.map(d => d.value));
              if (isFinite(minV) && isFinite(maxV) && maxV > minV) { dMin = minV; dMax = maxV; }
            }
            // Base the track on the index's FIXED colorRange (not the live `range`)
            // so it doesn't shift while the user drags a handle.
            const trackMin = Math.min(dMin, activeConfig.colorRange[0], range[0]);
            const trackMax = Math.max(dMax, activeConfig.colorRange[1], range[1]);
            const tSpan = trackMax - trackMin || 1e-6;
            const cSpan = (range[1] - range[0]) || 1e-6;

            // Interpolate the red→yellow→green ramp at t∈[0,1].
            const RED = [239, 68, 68], YEL = [234, 179, 8], GRN = [34, 197, 94];
            const mix = (a: number[], b: number[], u: number) =>
              `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)},${Math.round(a[1] + (b[1] - a[1]) * u)},${Math.round(a[2] + (b[2] - a[2]) * u)})`;
            const rampColor = (t: number) => {
              t = Math.max(0, Math.min(1, t));
              return t < 0.5 ? mix(RED, YEL, t / 0.5) : mix(YEL, GRN, (t - 0.5) / 0.5);
            };
            // Gradient stops across the track, each coloured by the ABSOLUTE value.
            const gradientStops = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map(p => {
              const val = trackMin + p * tSpan;
              return { offset: `${p * 100}%`, color: rampColor((val - range[0]) / cSpan) };
            });

            // range ⊆ track, so this never actually clamps — just a safety net.
            const sval: [number, number] = [
              Math.max(trackMin, Math.min(trackMax, range[0])),
              Math.max(trackMin, Math.min(trackMax, range[1])),
            ];

            return (
              <>
                {/* Histogram (data distribution, positioned by value, coloured by absolute ramp) */}
                <div className="h-24 w-full relative mb-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={histogramData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGradient" x1="0" y1="0" x2="1" y2="0">
                          {gradientStops.map((s, i) => (
                            <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={1} />
                          ))}
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="value" type="number" domain={[trackMin, trackMax]} hide />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="none"
                        fillOpacity={1}
                        fill="url(#colorGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Slider Controls */}
                <div className="px-1 mt-4 relative">
                  <Slider
                    min={trackMin}
                    max={trackMax}
                    step={tSpan / 100}
                    value={sval}
                    onValueChange={(val: number[]) => onRangeChange(val as [number, number])}
                    className="my-4"
                  />
                  <div className="flex justify-between items-center text-xs text-white">
                    <div className="bg-sky-500 px-1.5 py-0.5 rounded">{range[0].toFixed(2)}</div>
                    <div className="bg-sky-500 px-1.5 py-0.5 rounded">{range[1].toFixed(2)}</div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Advanced Band Mapping */}
          {isAdmin && (
            <div className="mt-8 pt-4 border-t border-white/5">
              <details className="group">
                  <summary className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40 cursor-pointer list-none flex items-center justify-between hover:text-muted-foreground transition-all duration-200">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-sky-500/50 animate-pulse" />
                        Sensor Calibration
                      </div>
                      <span className="text-[8px] opacity-40 transition-transform group-open:rotate-180">▼</span>
                  </summary>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-inner">
                      {(mapMode === 'RGB'
                        ? [
                            { label: 'Red Channel', key: 'r', color: 'text-red-400/80' },
                            { label: 'Green Channel', key: 'g', color: 'text-green-400/80' },
                            { label: 'Blue Channel', key: 'b', color: 'text-blue-400/80' }
                          ]
                        : [
                            { label: 'Red Channel', key: 'r', color: 'text-red-400/80' },
                            { label: 'Green Channel', key: 'g', color: 'text-green-400/80' },
                            { label: 'NIR (Infrared)', key: 'nir', color: 'text-purple-400/80' },
                            { label: 'Red-Edge', key: 're', color: 'text-orange-400/80' }
                          ]
                      ).map((item) => (
                          <div key={item.key} className="flex flex-col gap-2">
                              <label className={`text-[9px] font-semibold tracking-wide ${item.color} flex items-center gap-1`}>
                                {item.label}
                              </label>
                              <Select 
                                  value={bandMapping[item.key as keyof typeof bandMapping].toString()} 
                                  onValueChange={(val) => updateMapping(item.key as any, val)}
                              >
                                  <SelectTrigger className="h-7 text-[10px] bg-black/20 border-white/10 hover:border-sky-500/40 transition-colors">
                                      <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-900 border-white/10">
                                      {(mapMode === 'RGB' ? [0, 1, 2] : [0, 1, 2, 3]).map((b) => (
                                          <SelectItem key={b} value={b.toString()} className="text-[10px] focus:bg-sky-500/20">
                                              Band {b + 1}
                                          </SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                          </div>
                      ))}
                  </div>
              </details>
              <div className="mt-4 text-[9px] text-muted-foreground/40 leading-relaxed text-center italic">
                Use this section to calibrate channel offsets for non-standard multispectral sensors.
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
