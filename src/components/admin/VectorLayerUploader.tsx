import { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UploadCloud, X } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface VectorLayerUploaderProps {
  golfCourseId: string
  onUploadSuccess?: () => void
  className?: string
}

export function VectorLayerUploader({ 
  golfCourseId, 
  onUploadSuccess, 
  className = '' 
}: VectorLayerUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<Array<{
    file: File
    name: string
    type: string
    featureCount: number
    bounds: [number, number, number, number]
  }>>([])
  const [courses, setCourses] = useState<Array<{ id: string; name: string; r2_folder_path: string }>>([])
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  
  const { toast } = useToast()

  // Fetch available courses for this golf club
  useEffect(() => {
    const fetchCourses = async () => {
      if (!golfCourseId) return
      
      setIsLoadingCourses(true)
      try {
        const { data, error } = await supabase
          .from('golf_course_tilesets')
          .select('id, name, r2_folder_path')
          .eq('golf_course_id', golfCourseId)
          .eq('is_active', true)
          .order('name')
        
        if (error) throw error
        
        if (data && data.length > 0) {
          setCourses(data)
          // Auto-select first course if only one exists
          if (data.length === 1) {
            setSelectedCourse(data[0].id)
          }
        }
      } catch (error) {
        console.error('Error fetching courses:', error)
        toast({
          title: 'Error',
          description: 'Failed to load courses',
          variant: 'destructive',
        })
      } finally {
        setIsLoadingCourses(false)
      }
    }
    
    fetchCourses()
  }, [golfCourseId, toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/geo+json': ['.geojson', '.json'],
      'application/json': ['.geojson', '.json'],
    },
    multiple: true,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const newPreviews: typeof previews = []
        
        for (const file of acceptedFiles) {
        
          try {
            // Parse GeoJSON for preview
            const text = await file.text()
            const geojson = JSON.parse(text)
            
            if (!geojson.features || !Array.isArray(geojson.features)) {
              throw new Error(`Invalid GeoJSON in ${file.name}: Must be a FeatureCollection`)
            }

            // Calculate bounds
            let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90
            
            geojson.features.forEach((feature: any) => {
              if (!feature.geometry?.coordinates) return
              
              const processCoords = (coords: any[]) => {
                if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                  // Handle [lng, lat] or [lng, lat, ...]
                  coords.forEach(coord => {
                    const [lng, lat] = coord
                    minLng = Math.min(minLng, lng)
                    minLat = Math.min(minLat, lat)
                    maxLng = Math.max(maxLng, lng)
                    maxLat = Math.max(maxLat, lat)
                  })
                } else if (Array.isArray(coords[0])) {
                  // Handle nested arrays (e.g., polygons, multi-linestrings)
                  coords.forEach(processCoords)
                }
              }

              processCoords(feature.geometry.coordinates)
            })

            newPreviews.push({
              file,
              name: file.name.replace(/\.[^/.]+$/, ''),
              type: geojson.features[0]?.geometry?.type || 'Unknown',
              featureCount: geojson.features.length,
              bounds: [minLng, minLat, maxLng, maxLat]
            })
          } catch (error) {
            console.error(`Error processing ${file.name}:`, error)
            toast({
              title: 'Error',
              description: error instanceof Error ? error.message : `Failed to process ${file.name}`,
              variant: 'destructive',
            })
          }
        }
        
        if (newPreviews.length > 0) {
          setFiles(acceptedFiles)
          setPreviews(newPreviews)
        }
      }
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (files.length === 0) return

    // Validate golfCourseId
    if (!golfCourseId) {
      toast({
        title: 'Error',
        description: 'Golf club ID is missing. Please select a golf course.',
        variant: 'destructive',
      })
      return
    }

    // Validate course selection
    if (!selectedCourse) {
      toast({
        title: 'Error',
        description: 'Please select a golf course for this vector layer.',
        variant: 'destructive',
      })
      return
    }

    // Get course name from r2_folder_path (e.g., "test20/tiles" -> "test20")
    const course = courses.find(c => c.id === selectedCourse)
    if (!course) {
      toast({
        title: 'Error',
        description: 'Selected course not found.',
        variant: 'destructive',
      })
      return
    }
    
    // Extract course name from r2_folder_path
    // r2_folder_path format: "test20/tiles" or "test20/2024-11-05/14-30/tiles"
    const courseName = course.r2_folder_path.split('/')[0]

    try {
      setIsUploading(true)
      
      // Get the current user's session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        throw new Error('You must be logged in to upload layers. Please log out and log back in.')
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-vector-layer`
      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      // Upload each file
      for (const preview of previews) {
        try {
          const formData = new FormData()
          formData.append('file', preview.file)
          formData.append('golf_course_id', golfCourseId)
          formData.append('course_name', courseName)
          formData.append('name', preview.name)
          formData.append('description', `${preview.type} layer with ${preview.featureCount} features`)

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            },
            body: formData
          })

          if (!response.ok) {
            const errorText = await response.text()
            let errorMessage = 'Failed to upload'
            try {
              const errorJson = JSON.parse(errorText)
              errorMessage = errorJson.error || errorMessage
            } catch {
              errorMessage = errorText || errorMessage
            }
            throw new Error(errorMessage)
          }

          successCount++
        } catch (error) {
          failCount++
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          errors.push(`${preview.name}: ${errorMsg}`)
          console.error(`Failed to upload ${preview.name}:`, error)
        }
      }

      // Show results
      if (successCount > 0) {
        toast({
          title: 'Upload Complete',
          description: `Successfully uploaded ${successCount} layer${successCount > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`,
        })
      }

      if (failCount > 0 && successCount === 0) {
        toast({
          title: 'Upload Failed',
          description: errors.join(', '),
          variant: 'destructive',
        })
      }
      
      if (successCount > 0) {
        onUploadSuccess?.()
        setFiles([])
        setPreviews([])
      }
      // Don't reset selectedCourse - keep it for next upload
    } catch (error) {
      console.error('Upload failed:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload vector layer',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
    setPreviews(previews.filter((_, i) => i !== index))
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h3 className="text-lg font-medium">Upload Vector Layer</h3>
        <p className="text-sm text-muted-foreground">
          Upload a GeoJSON file containing your vector data
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors ${
          isDragActive ? 'border-primary bg-accent/20' : 'border-muted-foreground/25'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <UploadCloud className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isDragActive
              ? 'Drop the GeoJSON file here'
              : 'Drag & drop a GeoJSON file here, or click to select'}
          </p>
          <p className="text-xs text-muted-foreground/70">
            Supports .geojson and .json files
          </p>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{previews.length} file{previews.length > 1 ? 's' : ''} selected</p>
            {previews.map((preview, index) => (
              <div key={index} className="p-3 border rounded-lg bg-muted/20">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{preview.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {preview.type} • {preview.featureCount} features
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Bounds: {preview.bounds.map(n => n.toFixed(4)).join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(index)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="course">Golf Course</Label>
              <Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={isLoadingCourses || courses.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingCourses ? "Loading courses..." : courses.length === 0 ? "No courses available" : "Select a course"} />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCourse && previews.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  R2 Path: {courses.find(c => c.id === selectedCourse)?.r2_folder_path.split('/')[0]}/Vector_Layers/[layer_name].geojson
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload Layer'
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}