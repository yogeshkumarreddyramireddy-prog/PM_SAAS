import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Calendar, Layers } from 'lucide-react';
import { format } from 'date-fns';

interface HealthMap {
  id: string;
  name: string;
  analysis_date: string;
  analysis_time: string;
  r2_folder_path: string;
}

interface HealthMapStackProps {
  healthMaps: HealthMap[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  showStack: boolean;
}

export const HealthMapStack: React.FC<HealthMapStackProps> = ({
  healthMaps,
  selectedIds,
  onSelectionChange,
  showStack
}) => {
  const toggleHealthMap = (id: string) => {
    if (selectedIds.includes(id)) {
      // Remove from stack
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      // Add to top of stack
      onSelectionChange([...selectedIds, id]);
    }
  };

  const removeFromStack = (id: string) => {
    onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
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
    return selectedIds.length - index; // Reverse for display (top = highest number)
  };

  return (
    <div className="space-y-3">
      {/* Selection List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Health Maps
            {selectedIds.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedIds.length} selected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {healthMaps.map((healthMap) => {
            const isSelected = selectedIds.includes(healthMap.id);
            const stackPos = getStackPosition(healthMap.id);

            return (
              <div
                key={healthMap.id}
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleHealthMap(healthMap.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {healthMap.name || 'Health Map'}
                      </p>
                      {stackPos !== null && (
                        <Badge variant="default" className="text-xs">
                          Layer {stackPos}
                          {stackPos === selectedIds.length && ' (Top)'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      {formatDateTime(healthMap.analysis_date, healthMap.analysis_time)}
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeFromStack(healthMap.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {healthMaps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No health maps available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stack Visualization */}
      {showStack && selectedIds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Layer Stack (Top to Bottom)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...selectedIds].reverse().map((id, index) => {
              const healthMap = healthMaps.find(hm => hm.id === id);
              if (!healthMap) return null;

              const position = selectedIds.length - index;
              const isTop = index === 0;

              return (
                <div
                  key={id}
                  className={`flex items-center justify-between p-2 border rounded ${
                    isTop ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={isTop ? "default" : "secondary"} className="text-xs">
                      {position}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        {healthMap.name || 'Health Map'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(healthMap.analysis_date, healthMap.analysis_time)}
                      </p>
                    </div>
                  </div>
                  {isTop && (
                    <Badge variant="default" className="text-xs">
                      Swipe Target
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HealthMapStack;
