import React, { useRef } from 'react';
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
  Loader2
} from 'lucide-react';
import { DrawingTool } from '@/types/annotation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
}

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
}) => {

  const handleToolClick = (tool: DrawingTool) => {
    if (activeTool === tool) {
      setActiveTool(null);
    } else {
      setActiveTool(tool);
    }
  };

  const tools = [
    { id: 'draw_point' as DrawingTool, icon: MapPin, label: 'Draw Point' },
    { id: 'draw_line' as DrawingTool, icon: Ruler, label: 'Draw Line' },
    { id: 'select_area' as DrawingTool, icon: PenSquare, label: 'Select Area' },
    { id: 'draw_plots' as DrawingTool, icon: Grid3X3, label: 'Draw Plots' },
    { id: 'import' as DrawingTool, icon: Upload, label: 'Import Annotations', action: onImportClick },
    { id: 'edit' as DrawingTool, icon: Pencil, label: 'Edit (Cmd/Ctrl+click for multi-select)' },
    { id: 'delete' as DrawingTool, icon: Trash2, label: 'Delete Selected', action: onDeleteSelected, disabled: !canDelete },
    { id: 'undo' as DrawingTool, icon: Undo2, label: 'Undo Last Edit', action: onUndo, disabled: !canUndo },
    { id: 'export' as DrawingTool, icon: Download, label: 'Export as GeoJSON', action: onExportGeoJSON },
  ];

  return (
    <div className="flex flex-col">
      <TooltipProvider delayDuration={300}>
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;
          const Icon = tool.icon;

          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => tool.action ? tool.action() : handleToolClick(tool.id)}
                  disabled={tool.disabled}
                  className={cn(
                    "flex items-center justify-center h-9 w-9 shrink-0 rounded-none transition-colors border-b border-border focus:ring-0",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : tool.disabled ? "text-muted-foreground opacity-40 cursor-not-allowed hover:bg-transparent" : "text-foreground hover:bg-muted"
                  )}
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={isActive}
                >
                  <Icon className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium text-sm">
                {tool.label}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Save button — action only, not a toggle tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onSaveAsVectorLayers}
              disabled={isSavingVectorLayers}
              className={cn(
                "flex items-center justify-center h-9 w-9 shrink-0 rounded-none transition-colors last:border-b-0 focus:ring-0",
                isSavingVectorLayers
                  ? "text-muted-foreground opacity-60 cursor-not-allowed"
                  : "text-green-600 hover:bg-muted"
              )}
              aria-label="Save annotations as vector layers"
            >
              {isSavingVectorLayers
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <CloudUpload className="w-5 h-5" />
              }
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-sm">
            Save as vector layers
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
