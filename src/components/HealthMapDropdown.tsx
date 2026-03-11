import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp, Activity, Calendar, Crosshair } from 'lucide-react';
import { format } from 'date-fns';

interface HealthMap {
  id: string;
  name: string;
  analysis_date: string;
  analysis_time: string;
  r2_folder_path: string;
}

interface HealthMapDropdownProps {
  healthMaps: HealthMap[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  onAnimateIn: () => void;
  onAnimateOut: () => void;
  isAnimating: boolean;
}

export const HealthMapDropdown: React.FC<HealthMapDropdownProps> = ({
  healthMaps,
  selectedIds,
  onSelectionChange,
  enabled,
  onToggleEnabled,
  opacity,
  onOpacityChange,
  onAnimateIn,
  onAnimateOut,
  isAnimating
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleHealthMap = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const formatDateTime = (date: string, time: string) => {
    try {
      const dateTime = new Date(`${date}T${time}`);
      return format(dateTime, 'MMM dd, yyyy HH:mm');
    } catch {
      return `${date} ${time}`;
    }
  };

  const getStackPosition = (id: string) => {
    const index = selectedIds.indexOf(id);
    if (index === -1) return null;
    return selectedIds.length - index;
  };

  if (healthMaps.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 z-10">
      {/* Collapsed Header */}
      <div 
        className={`bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border transition-all duration-200 ${
          isExpanded ? 'rounded-b-none' : ''
        }`}
      >
        <div 
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Activity className={`w-4 h-4 ${enabled ? 'text-green-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium">Health Maps</span>
          {selectedIds.length > 0 && enabled && (
            <Badge variant="default" className="text-xs bg-green-600">
              {selectedIds.length}
            </Badge>
          )}
          <div className="flex-1" />
          <Button
            variant={enabled ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled(!enabled);
            }}
          >
            {enabled ? 'ON' : 'OFF'}
          </Button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t bg-white rounded-b-lg">
            {/* Layer Selection */}
            <div className="max-h-48 overflow-y-auto">
              {healthMaps.map((healthMap) => {
                const isSelected = selectedIds.includes(healthMap.id);
                const stackPos = getStackPosition(healthMap.id);
                const isSwipeTarget = stackPos === selectedIds.length && isSelected;

                return (
                  <div
                    key={healthMap.id}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b last:border-b-0 ${
                      isSelected ? 'bg-green-50' : ''
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleHealthMap(healthMap.id)}
                      disabled={!enabled}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {healthMap.name || 'Health Map'}
                        </span>
                        {isSwipeTarget && (
                          <Crosshair className="w-3 h-3 text-blue-600" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {formatDateTime(healthMap.analysis_date, healthMap.analysis_time)}
                      </div>
                    </div>
                    {stackPos !== null && (
                      <Badge 
                        variant={isSwipeTarget ? "default" : "secondary"} 
                        className="text-xs"
                      >
                        {stackPos}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Controls */}
            {enabled && selectedIds.length > 0 && (
              <div className="border-t px-4 py-3 space-y-3 bg-gray-50/50">
                {/* Opacity Slider */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-14">Opacity</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={opacity * 100}
                    onChange={(e) => onOpacityChange(parseInt(e.target.value) / 100)}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                  />
                  <span className="text-xs text-gray-600 w-10 text-right">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>

                {/* Animate Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAnimateIn}
                    disabled={isAnimating}
                    className="flex-1 h-8 text-xs"
                  >
                    Fade In →
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAnimateOut}
                    disabled={isAnimating}
                    className="flex-1 h-8 text-xs"
                  >
                    ← Fade Out
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthMapDropdown;
