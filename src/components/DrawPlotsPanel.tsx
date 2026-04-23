import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PlotGridConfig, PlotLabelConfig } from '@/types/annotation';

interface DrawPlotsPanelProps {
  onClose: () => void;
  config: PlotGridConfig | null;
  onConfigChange: (config: Partial<PlotGridConfig>) => void;
  onConfirm: (labelConfig: PlotLabelConfig) => void;
}

export const DrawPlotsPanel: React.FC<DrawPlotsPanelProps> = ({
  onClose,
  config,
  onConfigChange,
  onConfirm
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  
  // Local state for Step 2
  const [startCorner, setStartCorner] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [firstId, setFirstId] = useState<number>(1);
  const [path, setPath] = useState<'first_row' | 'column_first' | 'snake'>('first_row');
  const [variety, setVariety] = useState('');
  const [applicationType, setApplicationType] = useState('');

  // Fallback defaults if config is null initially
  const numRows = config?.numRows ?? 5;
  const numColumns = config?.numColumns ?? 5;
  const plotLength = config?.plotLength ?? 5;
  const plotWidth = config?.plotWidth ?? 5;
  const gapLength = config?.gapLength ?? 1;
  const gapWidth = config?.gapWidth ?? 1;

  const handleNumericChange = (key: keyof PlotGridConfig, value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      onConfigChange({ [key]: parsed });
    }
  };

  const handleDrawPlots = () => {
    onConfirm({
      startCorner,
      firstId,
      path,
      variety,
      applicationType
    });
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 z-30 bg-background border-l border-border shadow-lg flex flex-col">
      {/* Header */}
      <div className="bg-primary text-primary-foreground flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-medium">Draw plots</h2>
        <button onClick={onClose} className="text-primary-foreground/80 hover:text-primary-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center p-4 border-b border-border">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              1
            </div>
            <span className={`text-sm ${step === 1 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Plot dimensions</span>
          </div>
          <div className="w-8 h-px bg-border"></div>
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              2
            </div>
            <span className={`text-sm ${step === 2 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Plot labeling</span>
          </div>
        </div>
      </div>

      {/* Content Step 1 */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Number of rows</Label>
              <Input type="number" min="1" value={numRows} onChange={(e) => handleNumericChange('numRows', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Number of columns</Label>
              <Input type="number" min="1" value={numColumns} onChange={(e) => handleNumericChange('numColumns', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Plot length (m)</Label>
              <Input type="number" min="0.1" step="0.1" value={plotLength} onChange={(e) => handleNumericChange('plotLength', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Plot width (m)</Label>
              <Input type="number" min="0.1" step="0.1" value={plotWidth} onChange={(e) => handleNumericChange('plotWidth', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gap length (m)</Label>
              <Input type="number" min="0" step="0.1" value={gapLength} onChange={(e) => handleNumericChange('gapLength', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gap width (m)</Label>
              <Input type="number" min="0" step="0.1" value={gapWidth} onChange={(e) => handleNumericChange('gapWidth', e.target.value)} />
            </div>
          </div>

          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-foreground">
            You can drag and rotate the plots on the map. Use the rotation handle to rotate and the center handle to move.
          </div>
        </div>
      )}

      {/* Content Step 2 */}
      {step === 2 && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          <div className="space-y-4">
            <h3 className="font-medium text-foreground">Set plot labels</h3>
            
            <div className="space-y-1.5">
              <Label>Start corner</Label>
              <Select value={startCorner} onValueChange={(val: any) => setStartCorner(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A (Bottom Left)</SelectItem>
                  <SelectItem value="B">B (Bottom Right)</SelectItem>
                  <SelectItem value="C">C (Top Right)</SelectItem>
                  <SelectItem value="D">D (Top Left)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>First ID</Label>
              <Input type="number" value={firstId} onChange={(e) => setFirstId(parseInt(e.target.value) || 1)} />
            </div>

            <div className="space-y-3">
              <Label>Path</Label>
              <RadioGroup value={path} onValueChange={(val: any) => setPath(val)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="first_row" id="first_row" />
                  <Label htmlFor="first_row" className="font-normal cursor-pointer">First row</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="column_first" id="column_first" />
                  <Label htmlFor="column_first" className="font-normal cursor-pointer">Column first</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="snake" id="snake" />
                  <Label htmlFor="snake" className="font-normal cursor-pointer">Snake pattern</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="w-full h-px bg-border my-2"></div>

          <div className="space-y-4">
            <h3 className="font-medium text-foreground text-sm">Plot Data</h3>
            
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Variety</Label>
              <Input value={variety} onChange={(e) => setVariety(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Application type</Label>
              <Input value={applicationType} onChange={(e) => setApplicationType(e.target.value)} />
            </div>
          </div>

          <Button variant="outline" className="w-full text-primary border-primary/50 hover:bg-primary/5 hover:text-primary justify-center">
            <Check className="w-4 h-4 mr-2" /> Apply Labels
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-border flex justify-between">
        {step === 1 ? (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="default" onClick={() => setStep(2)}>Next &gt;</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setStep(1)}>&lt; Back</Button>
            <Button variant="default" onClick={handleDrawPlots}><Check className="w-4 h-4 mr-2"/> Draw plots</Button>
          </>
        )}
      </div>
    </div>
  );
};
