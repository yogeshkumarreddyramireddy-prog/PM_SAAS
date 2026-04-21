import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from '@/components/ui/switch';
import { GripVertical, Pencil, Check, X } from 'lucide-react';

interface SortableLayerItemProps {
  id: string; // The layer ID for sortable
  name: string;
  isVisible: boolean;
  onToggle: (id: string, isVisible: boolean) => void;
  type: 'raster' | 'health' | 'vector';
  color?: string; // For vector dots
  // Admin-only editing
  editLabel?: string;           // pre-filled label (without date) for the edit form
  editDate?: string | null;     // pre-filled ISO date (YYYY-MM-DD) for the edit form
  onEdit?: (id: string, data: { name: string; date: string }) => Promise<void>;
}

export function SortableLayerItem({
  id, name, isVisible, onToggle, type, color,
  editLabel, editDate, onEdit
}: SortableLayerItemProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [inputName, setInputName] = useState('');
  const [inputDate, setInputDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputName(editLabel ?? name);
    setInputDate(editDate ?? '');
    setIsEditing(true);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onEdit) return;
    setIsSaving(true);
    try {
      await onEdit(id, { name: inputName.trim(), date: inputDate });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative mb-1.5 rounded-lg border transition-all ${
        isDragging ? 'shadow-2xl bg-primary/20 border-primary/40 ring-1 ring-primary/30' :
        isVisible ? 'bg-primary/10 border-primary/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]' : 'border-transparent hover:bg-muted/40'
      }`}
    >
      {/* ── Main row ── */}
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
          <div {...attributes} {...listeners} className="cursor-grab hover:bg-muted/60 p-1 rounded -ml-1 text-muted-foreground/40 hover:text-foreground touch-none">
            <GripVertical className="w-4 h-4 outline-none" />
          </div>

          <div className="flex items-center gap-2.5 min-w-0" onClick={() => onToggle(id, !isVisible)}>
            {type === 'raster'  && <div className="w-2.5 h-2.5 rounded-sm bg-blue-400 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />}
            {type === 'health'  && <div className="w-2.5 h-2.5 rounded-sm bg-green-400 shrink-0 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />}
            {type === 'vector'  && <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color || '#a855f7' }} />}
            <span className={`text-[13px] truncate cursor-pointer ${isVisible ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground/60'}`}>
              {name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pencil icon — admin only */}
          {onEdit && !isEditing && (
            <button
              onClick={openEdit}
              className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Edit display name"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <Switch
            checked={isVisible}
            onCheckedChange={(checked) => onToggle(id, checked)}
            className="scale-75 shrink-0 data-[state=checked]:bg-primary border-border/50"
            onClick={e => e.stopPropagation()}
          />
        </div>
      </div>

      {/* ── Inline edit panel ── */}
      {isEditing && (
        <div
          className="px-3 pb-3 pt-1 border-t border-border/30 bg-muted/30 rounded-b-lg space-y-2"
          onClick={e => e.stopPropagation()}
        >
          {/* Display label */}
          <div>
            <label className="block text-[11px] text-primary mb-0.5">Display Label</label>
            <input
              type="text"
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              placeholder="e.g. NDVI, RGB Orthomosaic"
              className="w-full px-2 py-1 text-xs bg-muted/60 border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Date — raster & health maps only */}
          {type !== 'vector' && (
            <div>
              <label className="block text-[11px] text-primary mb-0.5">
                {type === 'raster' ? 'Flight Date' : 'Analysis Date'}
              </label>
              <input
                type="date"
                value={inputDate}
                onChange={e => setInputDate(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-muted/60 border border-border rounded text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-0.5">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded hover:bg-muted/40 transition-colors"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={isSaving || !inputName.trim()}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary hover:bg-primary/80 text-primary-foreground rounded disabled:opacity-40 transition-colors"
            >
              <Check className="w-3 h-3" /> {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
