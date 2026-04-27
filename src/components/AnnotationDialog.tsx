import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatArea, formatDistance } from '@/lib/geoUtils';
import { PendingAnnotation } from '@/types/annotation';

interface AnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingAnnotation: PendingAnnotation | null;
  existingAnnotation?: any; // Annotation
  onSave: (data: { plotId: string, externalCode: string, comment: string, properties: Record<string, any> }) => void;
}

export const AnnotationDialog: React.FC<AnnotationDialogProps> = ({
  open,
  onOpenChange,
  pendingAnnotation,
  existingAnnotation,
  onSave
}) => {
  const [plotId, setPlotId] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [comment, setComment] = useState('');
  const [treatment, setTreatment] = useState('');
  const [variety, setVariety] = useState('');
  const [replicate, setReplicate] = useState('');

  // Reset form when opened
  useEffect(() => {
    if (open) {
      if (existingAnnotation) {
        setPlotId(existingAnnotation.plot_id || '');
        setExternalCode(existingAnnotation.external_code || '');
        setComment(existingAnnotation.comment || '');
        setTreatment(existingAnnotation.properties?.treatment || '');
        setVariety(existingAnnotation.properties?.variety || '');
        setReplicate(existingAnnotation.properties?.replicate || '');
      } else {
        setPlotId('');
        setExternalCode('');
        setComment('');
        setTreatment('');
        setVariety('');
        setReplicate('');
      }
    }
  }, [open, existingAnnotation]);

  const handleSave = () => {
    if (!plotId.trim()) {
      // In a real app we'd show a validation error here
      return;
    }

    onSave({
      plotId,
      externalCode,
      comment,
      properties: {
        treatment: treatment || null,
        variety: variety || null,
        replicate: replicate || null,
        ...(pendingAnnotation?.area ? { area_m2: pendingAnnotation.area } : {}),
        ...(pendingAnnotation?.length ? { length_m: pendingAnnotation.length } : {})
      }
    });
  };

  const isArea = pendingAnnotation?.area !== undefined;
  const isLine = pendingAnnotation?.length !== undefined;

  let measurementText = '';
  if (isArea) {
    measurementText = `Area ${formatArea(pendingAnnotation.area!)}`;
  } else if (isLine) {
    measurementText = `Length ${formatDistance(pendingAnnotation.length!)}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{existingAnnotation ? 'Edit Annotation' : 'Save Annotation'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="data">Plot Data</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plotId">Plot ID *</Label>
              <Input 
                id="plotId" 
                value={plotId} 
                onChange={(e) => setPlotId(e.target.value)} 
                placeholder="e.g. A1" 
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="externalCode">External Code</Label>
              <Input 
                id="externalCode" 
                value={externalCode} 
                onChange={(e) => setExternalCode(e.target.value)} 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment</Label>
              <Textarea 
                id="comment" 
                value={comment} 
                onChange={(e) => setComment(e.target.value)} 
                rows={3} 
              />
            </div>
          </TabsContent>
          
          <TabsContent value="data" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="treatment">Treatment</Label>
              <Input 
                id="treatment" 
                value={treatment} 
                onChange={(e) => setTreatment(e.target.value)} 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="variety">Variety</Label>
              <Input 
                id="variety" 
                value={variety} 
                onChange={(e) => setVariety(e.target.value)} 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="replicate">Replicate</Label>
              <Input 
                id="replicate" 
                value={replicate} 
                onChange={(e) => setReplicate(e.target.value)} 
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex-1">
            {measurementText && (
              <span className="bg-muted text-foreground px-3 py-1 rounded-full text-sm font-semibold">
                {measurementText}
              </span>
            )}
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="default" onClick={handleSave} disabled={!plotId.trim()}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
