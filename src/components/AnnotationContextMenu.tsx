import React, { useEffect, useRef } from 'react';
import { Edit2, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContextMenuState } from '@/types/annotation';

interface AnnotationContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onEdit: (annotationId: string) => void;
  onCopyCoordinates: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
}

export const AnnotationContextMenu: React.FC<AnnotationContextMenuProps> = ({
  contextMenu,
  onClose,
  onEdit,
  onCopyCoordinates,
  onDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu, onClose]);

  if (!contextMenu) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 min-w-[160px] bg-popover border border-border rounded-md shadow-md py-1 text-sm font-medium animate-in fade-in zoom-in-95 duration-100"
      style={{ top: contextMenu.y, left: contextMenu.x }}
    >
      <button
        onClick={() => {
          onEdit(contextMenu.annotationId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 flex items-center hover:bg-muted text-popover-foreground transition-colors"
      >
        <Edit2 className="w-4 h-4 mr-2" />
        Edit Properties
      </button>
      
      <button
        onClick={() => {
          onCopyCoordinates(contextMenu.annotationId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 flex items-center hover:bg-muted text-popover-foreground transition-colors"
      >
        <Copy className="w-4 h-4 mr-2" />
        Copy Coordinates
      </button>

      <div className="h-px bg-border my-1" />

      <button
        onClick={() => {
          onDelete(contextMenu.annotationId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 flex items-center hover:bg-muted text-destructive transition-colors"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete
      </button>
    </div>
  );
};
