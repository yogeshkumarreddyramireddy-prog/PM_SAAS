import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SourceTileset {
  id: string;
  golf_course_id: string;
  name: string;
  flight_date: string;
  flight_time: string;
  r2_folder_path: string;
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  center_lat: number;
  center_lon: number;
  min_zoom: number;
  max_zoom: number;
}

export default function HealthMapUploader() {
  const [sourceTilesets, setSourceTilesets] = useState<SourceTileset[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedSource, setSelectedSource] = useState<SourceTileset | null>(null);
  
  const [analysisDate, setAnalysisDate] = useState('');
  const [analysisTime, setAnalysisTime] = useState('');
  const [analysisType, setAnalysisType] = useState('ndvi');
  
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Load source tilesets
  useEffect(() => {
    loadSourceTilesets();
  }, []);

  const loadSourceTilesets = async () => {
    const { data, error } = await supabase
      .from('golf_course_tilesets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSourceTilesets(data);
    }
  };

  // Update selected source metadata
  useEffect(() => {
    const source = sourceTilesets.find(t => t.id === selectedSourceId);
    setSelectedSource(source || null);
  }, [selectedSourceId, sourceTilesets]);

  // Generate R2 path preview
  const getR2Path = () => {
    if (!selectedSource || !analysisDate || !analysisTime) return '';
    // Extract course name from r2_folder_path (e.g., "test21/2025-11-24/17-30/tiles" -> "test21")
    const courseName = selectedSource.r2_folder_path.split('/')[0];
    // Replace colons with dashes in time for R2 path
    const formattedTime = analysisTime.replace(/:/g, '-');
    return `${courseName}/health_maps/${analysisDate}/${formattedTime}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
    setUploadStatus('idle');
    setErrorMessage('');
  };

  const handleUpload = async () => {
    if (!selectedSource || !analysisDate || !analysisTime || !selectedFiles) {
      setErrorMessage('Please fill all required fields and select files');
      return;
    }

    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const r2FolderPath = getR2Path();
      
      // Extract course name from r2_folder_path
      const courseName = selectedSource.r2_folder_path.split('/')[0];
      
      const files = Array.from(selectedFiles);
      const tiles: Array<{ z: number; x: number; y: number }> = [];
      const tilesWithBlobs: Array<{ z: number; x: number; y: number; blob: Blob }> = [];

      // Prepare tiles array
      for (const file of files) {
        // Extract z/x/y from filename (e.g., "15/5242/12663.png")
        const pathMatch = file.webkitRelativePath.match(/(\d+)\/(\d+)\/(\d+)\.png$/);
        if (!pathMatch) continue;

        const [, z, x, y] = pathMatch;
        const coord = { z: parseInt(z), x: parseInt(x), y: parseInt(y) };
        tiles.push(coord);
        tilesWithBlobs.push({
          ...coord,
          blob: file
        });
      }

      // Get presigned URLs for health maps
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/r2-sign`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          action: 'getBatchPutUrls',
          courseId: courseName, 
          tiles: tiles,
          flightDate: analysisDate,
          flightTime: analysisTime,
          pathType: 'health_maps' // Important: use health_maps path
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Upload URL generation failed: ${response.status} ${errorData.error || response.statusText}`);
      }

      const { urls } = await response.json();
      
      if (!urls || !Array.isArray(urls)) {
        throw new Error('Invalid response: missing urls array');
      }

      // Upload tiles in parallel
      const concurrency = 30;
      let uploaded = 0;

      for (let i = 0; i < tilesWithBlobs.length; i += concurrency) {
        const batch = tilesWithBlobs.slice(i, i + concurrency);
        const urlBatch = urls.slice(i, i + concurrency);

        await Promise.all(
          batch.map((tile, idx) => {
            const tileInfo = urlBatch[idx];
            return fetch(tileInfo.url, {
              method: 'PUT',
              body: tile.blob,
              headers: { 'Content-Type': 'image/png' },
            }).then(() => {
              uploaded++;
              setUploadProgress(Math.round((uploaded / tilesWithBlobs.length) * 100));
            });
          })
        );
      }

      // Create health map tileset record in database
      const { error: dbError } = await supabase
        .from('health_map_tilesets')
        .insert({
          golf_course_id: selectedSource.golf_course_id,
          source_tileset_id: selectedSource.id,
          r2_folder_path: r2FolderPath,
          tile_url_pattern: '{z}/{x}/{y}.png',
          analysis_type: analysisType,
          analysis_date: analysisDate,
          analysis_time: analysisTime,
          min_lat: selectedSource.min_lat,
          max_lat: selectedSource.max_lat,
          min_lon: selectedSource.min_lon,
          max_lon: selectedSource.max_lon,
          center_lat: selectedSource.center_lat,
          center_lon: selectedSource.center_lon,
          min_zoom: selectedSource.min_zoom,
          max_zoom: selectedSource.max_zoom,
          is_active: true
        });

      if (dbError) throw dbError;

      setUploadStatus('success');
      setUploadProgress(100);
      
      // Reset form
      setTimeout(() => {
        setSelectedSourceId('');
        setAnalysisDate('');
        setAnalysisTime('');
        setSelectedFiles(null);
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 3000);

    } catch (error: any) {
      console.error('Upload failed:', error);
      setErrorMessage(error.message || 'Upload failed');
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-600" />
          Upload Health Map Tiles
        </CardTitle>
        <CardDescription>
          Upload NDVI, stress analysis, or other health map tiles. Metadata will be copied from the source tileset.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Source Tileset Selection */}
        <div className="space-y-2">
          <Label htmlFor="source-tileset">Source Tileset *</Label>
          <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
            <SelectTrigger id="source-tileset">
              <SelectValue placeholder="Select source tileset" />
            </SelectTrigger>
            <SelectContent>
              {sourceTilesets.map((tileset) => (
                <SelectItem key={tileset.id} value={tileset.id}>
                  {tileset.name} ({tileset.flight_date} {tileset.flight_time})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Bounds and metadata will be copied from this tileset
          </p>
        </div>

        {/* Source Metadata Display */}
        {selectedSource && (
          <Alert>
            <AlertDescription>
              <div className="text-sm space-y-1">
                <p><strong>Course:</strong> {selectedSource.golf_course_id}</p>
                <p><strong>Bounds:</strong> [{selectedSource.min_lon}, {selectedSource.min_lat}] to [{selectedSource.max_lon}, {selectedSource.max_lat}]</p>
                <p><strong>Zoom:</strong> {selectedSource.min_zoom} - {selectedSource.max_zoom}</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Analysis Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="analysis-date">Analysis Date *</Label>
            <Input
              id="analysis-date"
              type="date"
              value={analysisDate}
              onChange={(e) => setAnalysisDate(e.target.value)}
              disabled={!selectedSource}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="analysis-time">Analysis Time *</Label>
            <Input
              id="analysis-time"
              type="time"
              value={analysisTime}
              onChange={(e) => setAnalysisTime(e.target.value)}
              disabled={!selectedSource}
            />
          </div>
        </div>

        {/* Analysis Type */}
        <div className="space-y-2">
          <Label htmlFor="analysis-type">Analysis Type</Label>
          <Select value={analysisType} onValueChange={setAnalysisType}>
            <SelectTrigger id="analysis-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ndvi">NDVI (Vegetation Index)</SelectItem>
              <SelectItem value="stress">Stress Analysis</SelectItem>
              <SelectItem value="moisture">Moisture Content</SelectItem>
              <SelectItem value="chlorophyll">Chlorophyll Content</SelectItem>
              <SelectItem value="custom">Custom Analysis</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* R2 Path Preview */}
        {getR2Path() && (
          <Alert>
            <AlertDescription>
              <p className="text-sm font-mono">
                <strong>Upload Path:</strong> {getR2Path()}/<strong>{'{z}/{x}/{y}.png'}</strong>
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* File Selection */}
        <div className="space-y-2">
          <Label htmlFor="tiles-folder">Health Map Tiles Folder *</Label>
          <Input
            id="tiles-folder"
            type="file"
            multiple
            onChange={handleFileSelect}
            disabled={!selectedSource || !analysisDate || !analysisTime}
            className="cursor-pointer"
            {...({ webkitdirectory: '', directory: '' } as any)}
          />
          <p className="text-xs text-muted-foreground">
            Select folder containing tiles in structure: 14/, 15/, 16/, etc.
          </p>
          {selectedFiles && (
            <p className="text-sm text-green-600">
              ✓ {selectedFiles.length} files selected
            </p>
          )}
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={isUploading || !selectedSource || !analysisDate || !analysisTime || !selectedFiles}
          className="w-full"
          size="lg"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading... {uploadProgress}%
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Health Map Tiles
            </>
          )}
        </Button>

        {/* Status Messages */}
        {uploadStatus === 'success' && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Health map tiles uploaded successfully!
            </AlertDescription>
          </Alert>
        )}

        {uploadStatus === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {/* Instructions */}
        <Alert>
          <AlertDescription className="text-sm space-y-2">
            <p><strong>Instructions:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Select the source tileset to copy metadata from</li>
              <li>Set the analysis date and time (can be different from flight)</li>
              <li>Choose the analysis type (NDVI, stress, etc.)</li>
              <li>Select the folder containing health map tiles</li>
              <li>Tiles must be organized as: zoom/x/y.png (e.g., 15/5242/12663.png)</li>
              <li>Click upload and wait for completion</li>
            </ol>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
