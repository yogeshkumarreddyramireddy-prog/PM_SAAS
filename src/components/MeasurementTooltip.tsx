import React from 'react';

interface MeasurementTooltipProps {
  measurement: string | null;
  position: { x: number; y: number } | null;
}

export const MeasurementTooltip: React.FC<MeasurementTooltipProps> = ({ measurement, position }) => {
  if (!measurement || !position) return null;

  return (
    <div
      className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2"
      style={{ left: position.x, top: position.y }}
    >
      <div className="bg-foreground/90 text-background text-sm font-semibold px-3 py-1.5 rounded-lg shadow-md backdrop-blur">
        {measurement}
      </div>
      {/* Little triangle pointing down */}
      <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-foreground/90"></div>
    </div>
  );
};
