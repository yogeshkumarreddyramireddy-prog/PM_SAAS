import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from '@/components/ui/switch';
import { GripVertical } from 'lucide-react';

interface SortableLayerItemProps {
  id: string; // The layer ID for sortable
  name: string;
  isVisible: boolean;
  onToggle: (id: string, isVisible: boolean) => void;
  type: 'raster' | 'health' | 'vector';
  color?: string; // For vector dots
}

export function SortableLayerItem({ id, name, isVisible, onToggle, type, color }: SortableLayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center justify-between p-2 mb-1.5 rounded-lg border transition-all ${
        isDragging ? 'shadow-2xl bg-teal-900/80 border-teal-500/50 ring-1 ring-teal-500/30' :
        isVisible ? 'bg-teal-800/30 border-teal-600/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]' : 'border-transparent hover:bg-teal-900/30'
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
        <div {...attributes} {...listeners} className="cursor-grab hover:bg-teal-800/60 p-1 rounded -ml-1 text-teal-200/40 hover:text-teal-100 touch-none">
           <GripVertical className="w-4 h-4 outline-none" />
        </div>
        
        <div className="flex items-center gap-2.5 min-w-0" onClick={() => onToggle(id, !isVisible)}>
          {type === 'raster' && <div className="w-2.5 h-2.5 rounded-sm bg-blue-400 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />}
          {type === 'health' && <div className="w-2.5 h-2.5 rounded-sm bg-green-400 shrink-0 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />}
          {type === 'vector' && <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color || '#a855f7' }} />}
          <span className={`text-[13px] truncate cursor-pointer ${isVisible ? 'font-semibold text-teal-50' : 'font-medium text-teal-100/60'}`}>{name}</span>
        </div>
      </div>
      <Switch
        checked={isVisible}
        onCheckedChange={(checked) => onToggle(id, checked)}
        className="scale-75 shrink-0 data-[state=checked]:bg-teal-500 border-teal-800/50"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
