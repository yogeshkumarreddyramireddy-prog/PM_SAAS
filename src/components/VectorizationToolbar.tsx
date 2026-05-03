import React from 'react';
import {
  MapPin,
  Ruler,
  PenSquare,
  Grid3X3,
  Upload,
  Pencil,
  Download,
  Undo2,
  Trash2,
  CloudUpload,
  Loader2,
  BarChart2,
  Crosshair,
} from 'lucide-react';
import { DrawingTool } from '@/types/annotation';
import { cn } from '@/lib/utils';

interface VectorizationToolbarProps {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  onImportClick: () => void;
  onExportGeoJSON: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onDeleteSelected: () => void;
  canDelete: boolean;
  onSaveAsVectorLayers: () => void;
  isSavingVectorLayers: boolean;
  onZonalStats: () => void;
  isPixelInspectorActive: boolean;
  onTogglePixelInspector: () => void;
  hasActiveCogLayer: boolean;
}

const ToolButton = ({
  onClick,
  disabled = false,
  isActive = false,
  label,
  isLast = false,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  label: string;
  isLast?: boolean;
  className?: string;
  children: React.ReactNode;
}) => (
  <div className="relative group">
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'flex items-center justify-center h-9 w-9 shrink-0 rounded-none transition-colors focus:outline-none focus:ring-0',
        !isLast && 'border-b border-border',
        isActive
          ? 'bg-primary text-primary-foreground'
          : disabled
          ? 'text-muted-foreground opacity-40 cursor-not-allowed hover:bg-transparent'
          : 'text-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
    {/* Tooltip — rendered in toolbar stacking context, appears to the right */}
    <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[9999] hidden group-hover:flex">
      <div className="bg-popover text-popover-foreground text-xs font-medium px-2.5 py-1.5 rounded-md shadow-md border border-border whitespace-nowrap">
        {label}
      </div>
    </div>
  </div>
);

export const VectorizationToolbar: React.FC<VectorizationToolbarProps> = ({
  activeTool,
  setActiveTool,
  onImportClick,
  onExportGeoJSON,
  onUndo,
  canUndo,
  onDeleteSelected,
  canDelete,
  onSaveAsVectorLayers,
  isSavingVectorLayers,
  onZonalStats,
  isPixelInspectorActive,
  onTogglePixelInspector,
  hasActiveCogLayer,
}) => {

  const handleToolClick = (tool: DrawingTool) => {
    if (isPixelInspectorActive) onTogglePixelInspector();
    if (activeTool === tool) {
      setActiveTool(null);
    } else {
      setActiveTool(tool);
    }
  };

  const tools = [
    { id: 'draw_point' as DrawingTool, icon: MapPin, label: 'Place Point Marker' },
    { id: 'draw_line' as DrawingTool, icon: Ruler, label: 'Draw & Measure Line' },
    { id: 'select_area' as DrawingTool, icon: PenSquare, label: 'Draw Polygon Area' },
    { id: 'draw_plots' as DrawingTool, icon: Grid3X3, label: 'Draw Plot Grid' },
    { id: 'import' as DrawingTool, icon: Upload, label: 'Import Annotations (GeoJSON / ZIP)', action: onImportClick },
    { id: 'edit' as DrawingTool, icon: Pencil, label: 'Edit Annotations — Cmd/Ctrl+click to multi-select' },
    { id: 'delete' as DrawingTool, icon: Trash2, label: 'Delete Selected Annotation', action: onDeleteSelected, disabled: !canDelete },
    { id: 'undo' as DrawingTool, icon: Undo2, label: 'Undo Last Edit', action: onUndo, disabled: !canUndo },
    { id: 'export' as DrawingTool, icon: Download, label: 'Export Annotations as GeoJSON', action: onExportGeoJSON },
  ];

  return (
    <div className="flex flex-col">
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        const Icon = tool.icon;
        return (
          <ToolButton
            key={tool.id}
            onClick={() => tool.action ? tool.action() : handleToolClick(tool.id)}
            disabled={tool.disabled}
            isActive={isActive}
            label={tool.label}
          >
            <Icon className="w-5 h-5" />
          </ToolButton>
        );
      })}

      <ToolButton
        onClick={onSaveAsVectorLayers}
        disabled={isSavingVectorLayers}
        label="Save Annotations as Vector Layers"
        className={isSavingVectorLayers ? '' : 'text-green-600'}
      >
        {isSavingVectorLayers
          ? <Loader2 className="w-5 h-5 animate-spin" />
          : <CloudUpload className="w-5 h-5" />
        }
      </ToolButton>

      <ToolButton
        onClick={onZonalStats}
        label="Run Zonal Statistics on Drawn Areas"
        className="text-violet-600"
      >
        <BarChart2 className="w-5 h-5" />
      </ToolButton>

      <ToolButton
        onClick={onTogglePixelInspector}
        disabled={!hasActiveCogLayer}
        isActive={isPixelInspectorActive}
        label={
          hasActiveCogLayer
            ? 'Pixel Inspector — Click map to read index value at that point'
            : 'Pixel Inspector — Requires an active multispectral analysis layer'
        }
        isLast
      >
        <Crosshair className="w-5 h-5" />
      </ToolButton>
    </div>
  );
};
