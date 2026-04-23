import React, { useRef } from 'react';
import { 
  MapPin, 
  Ruler, 
  PenSquare, 
  Grid3X3, 
  Upload, 
  BoxSelect, 
  Download,
  Undo2
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
}

export const VectorizationToolbar: React.FC<VectorizationToolbarProps> = ({
  activeTool,
  setActiveTool,
  onImportClick,
  onExportGeoJSON,
  onUndo,
  canUndo
}) => {
  
  const handleToolClick = (tool: DrawingTool) => {
    // Toggle off if clicking the same tool
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
    { id: 'select_multiple' as DrawingTool, icon: BoxSelect, label: 'Select Multiple' },
    { id: 'undo' as DrawingTool, icon: Undo2, label: 'Undo Last Edit', action: onUndo, disabled: !canUndo },
    { id: 'export' as DrawingTool, icon: Download, label: 'Export as GeoJSON', action: onExportGeoJSON },
  ];

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 p-2 bg-background/95 backdrop-blur-md shadow-md border border-border/50 rounded-xl">
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
                    "flex items-center justify-center w-10 h-10 rounded-full transition-smooth",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : tool.disabled ? "text-muted-foreground opacity-50 cursor-not-allowed" : "text-foreground hover:bg-muted/80"
                  )}
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
      </TooltipProvider>
    </div>
  );
};
