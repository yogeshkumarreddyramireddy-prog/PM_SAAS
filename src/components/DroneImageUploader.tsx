import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle, AlertCircle, Loader2, Calendar, Clock } from 'lucide-react';
import { ImageService } from '@/lib/imageService';
import { cn } from '@/lib/utils';
import { useDropzone } from 'react-dropzone';
import * as exifr from 'exifr';
import { useUploadContext } from '@/contexts/UploadContext';

interface DroneImageUploaderProps {
    golfCourseId: number;
    golfCourseName: string;
    onUploadComplete?: () => void;
}

export function DroneImageUploader({ golfCourseId, golfCourseName, onUploadComplete }: DroneImageUploaderProps) {
    const { droneUploadState, setDroneUploadState, clearDroneUploadState } = useUploadContext();
    const { flightDate, flightTime, selectedFiles, isUploading, uploadProgress, uploadStatus, errorMessage } = droneUploadState;

    const setFlightDate = (date: string) => setDroneUploadState(prev => ({ ...prev, flightDate: date }));
    const setFlightTime = (time: string) => setDroneUploadState(prev => ({ ...prev, flightTime: time }));
    const setSelectedFiles = (files: File[] | ((prev: File[]) => File[])) => {
        if (typeof files === 'function') {
            setDroneUploadState(prev => ({ ...prev, selectedFiles: files(prev.selectedFiles) }));
        } else {
            setDroneUploadState(prev => ({ ...prev, selectedFiles: files }));
        }
    };
    const setIsUploading = (isUploading: boolean) => setDroneUploadState(prev => ({ ...prev, isUploading }));
    const setUploadProgress = (progress: number) => setDroneUploadState(prev => ({ ...prev, uploadProgress: progress }));
    const setUploadStatus = (status: 'idle' | 'uploading' | 'success' | 'error') => setDroneUploadState(prev => ({ ...prev, uploadStatus: status }));
    const setErrorMessage = (msg: string) => setDroneUploadState(prev => ({ ...prev, errorMessage: msg }));

    const [isExtractingExif, setIsExtractingExif] = useState(false);

    const onDrop = async (acceptedFiles: File[]) => {
        setUploadStatus('idle');
        setErrorMessage('');

        if (acceptedFiles.length === 0) return;

        // Extract EXIF from the first file if we haven't already
        if (!flightDate || !flightTime) {
            setIsExtractingExif(true);
            try {
                // Parse EXIF tags for date and time. pick: limits parsing to just these tags for speed
                const exifData = await exifr.parse(acceptedFiles[0], { pick: ['DateTimeOriginal', 'CreateDate'] });
                
                const rawDate = exifData?.DateTimeOriginal || exifData?.CreateDate;
                if (rawDate) {
                    const dateObj = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
                    if (!isNaN(dateObj.getTime())) {
                        // Format YYYY-MM-DD
                        const yyyy = dateObj.getFullYear();
                        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const dd = String(dateObj.getDate()).padStart(2, '0');
                        setFlightDate(`${yyyy}-${mm}-${dd}`);

                        // Format HH:mm
                        const hours = String(dateObj.getHours()).padStart(2, '0');
                        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                        setFlightTime(`${hours}:${minutes}`);
                    } else {
                        setErrorMessage('Could not determine valid date from image metadata.');
                    }
                } else {
                    setErrorMessage('No EXIF date metadata found in the first image.');
                }
            } catch (error) {
                console.error('Error extracting EXIF data:', error);
                setErrorMessage('Failed to extract metadata. Please make sure the images contain valid EXIF data.');
            } finally {
                setIsExtractingExif(false);
            }
        }

        setSelectedFiles(prev => [...prev, ...acceptedFiles]);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.tiff', '.tif']
        }
    });

    const handleUpload = async () => {
        if (!flightDate || !flightTime || selectedFiles.length === 0) {
            setErrorMessage('Please provide flight date, time, and select images');
            return;
        }

        setIsUploading(true);
        setUploadStatus('uploading');
        setUploadProgress(0);
        setErrorMessage('');

        try {
            const result = await ImageService.uploadMultipleFilesBatch(
                selectedFiles,
                {
                    golfCourseId,
                    golfCourseName,
                    flightDate,
                    flightTime
                },
                (progress) => {
                    setUploadProgress(progress.percentage);
                }
            );

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            setUploadStatus('success');
            setUploadProgress(100);
            onUploadComplete?.();

            // Reset form after a few seconds
            setTimeout(() => {
                clearDroneUploadState();
            }, 3000);

        } catch (error: any) {
            console.error('Upload failed:', error);
            setErrorMessage(error.message || 'Upload failed');
            setUploadStatus('error');
        } finally {
            setIsUploading(false);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const formatSize = (bytes: number) => {
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" />
                    Upload Drone Imagery
                </CardTitle>
                <CardDescription>
                    Upload raw drone images (JPEG/PNG/TIFF) for {golfCourseName}.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Flight Date & Time (Auto-extracted) */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Flight Date</Label>
                        <div className={cn(
                            "flex items-center h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground",
                            !flightDate && "italic opacity-70"
                        )}>
                            <Calendar className="w-4 h-4 mr-2 opacity-50" />
                            {isExtractingExif ? 'Extracting...' : (flightDate || 'Extracted automatically')}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Flight Time</Label>
                        <div className={cn(
                            "flex items-center h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground",
                            !flightDate && "italic opacity-70"
                        )}>
                            <Clock className="w-4 h-4 mr-2 opacity-50" />
                            {isExtractingExif ? 'Extracting...' : (flightTime || 'Extracted automatically')}
                        </div>
                    </div>
                </div>

                {/* Drag and Drop Zone */}
                <div className="space-y-2">
                    <Label>Drone Images *</Label>
                    <div
                        {...getRootProps()}
                        className={cn(
                            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                            isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 text-muted-foreground",
                            isUploading && "opacity-50 pointer-events-none"
                        )}
                    >
                        <input {...getInputProps()} />
                        <Upload className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-sm font-medium">
                            {isDragActive
                                ? "Drop the files here ..."
                                : "Drag 'n' drop image files here, or click to select files"
                            }
                        </p>
                        <p className="text-xs mt-2 opacity-75">
                            Supports JPEG, PNG, TIFF. Max file size: 50MB per file.
                        </p>
                    </div>
                </div>

                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                    <div className="bg-muted/30 p-4 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium">{selectedFiles.length} files selected</span>
                            <span className="text-xs text-muted-foreground">{formatSize(totalSize)}</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-2 pr-2">
                            {selectedFiles.map((file, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs bg-background p-2 rounded border border-border">
                                    <span className="truncate max-w-[200px]" title={file.name}>{file.name}</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-muted-foreground">{formatSize(file.size)}</span>
                                        {!isUploading && (
                                            <button onClick={() => removeFile(idx)} className="text-destructive hover:underline">
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {!isUploading && selectedFiles.length > 0 && (
                            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setSelectedFiles([])}>
                                Clear All
                            </Button>
                        )}
                    </div>
                )}

                {/* Upload Button */}
                <div className="space-y-4">
                    {isUploading && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Uploading images...</span>
                                <span className="font-medium">{uploadProgress}%</span>
                            </div>
                            <Progress value={uploadProgress} className="w-full h-2" />
                        </div>
                    )}
                    <Button
                        onClick={handleUpload}
                        disabled={isUploading || !flightDate || !flightTime || selectedFiles.length === 0}
                        className="w-full"
                        size="lg"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4 mr-2" />
                                Upload {selectedFiles.length} Images
                            </>
                        )}
                    </Button>
                </div>

                {/* Status Messages */}
                {uploadStatus === 'success' && (
                    <Alert className="bg-success-green/10 border-success-green/30">
                        <CheckCircle className="w-4 h-4 text-success-green" />
                        <AlertDescription className="text-success-green">
                            Images uploaded successfully! They are now in the processing queue.
                        </AlertDescription>
                    </Alert>
                )}

                {uploadStatus === 'error' && (
                    <Alert variant="destructive">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}
