
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileUploadManagerFixed } from "@/components/FileUploadManager"
import { FileDownloader } from "@/components/FileDownloader"
import MapboxGolfCourseMap from "@/components/MapboxGolfCourseMap"
import { Building2, Upload, Eye, Trash2, Download, Calendar, Map, FileText, Image, Box, MapPin, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useGolfCourses, useContentFiles, useDeleteContentFile } from "@/hooks/useSupabaseQuery"
import { supabase } from "@/integrations/supabase/client"
import { VectorLayerManager } from "@/components/VectorLayerManager"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const contentTypes = [
  { id: 'live_maps', name: 'Live Maps', icon: Map, color: 'text-blue-600' },
  { id: 'reports', name: 'Reports', icon: FileText, color: 'text-green-600' },
  { id: 'hd_maps', name: 'HD Maps', icon: Image, color: 'text-purple-600' },
  { id: '3d_models', name: '3D Models', icon: Box, color: 'text-orange-600' },
] as const

export const AdminContentManagement = () => {
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [activeContentTab, setActiveContentTab] = useState<'live_maps' | 'reports' | 'hd_maps' | '3d_models'>('live_maps')
  const [uploadMode, setUploadMode] = useState(false)
  const [viewMode, setViewMode] = useState<'files' | 'map'>('files')
  const [isScanning, setIsScanning] = useState(false)
  const { toast } = useToast()

  const { data: golfCourses = [], isLoading: coursesLoading } = useGolfCourses()
  const { data: contentFiles = [], isLoading: filesLoading, refetch } = useContentFiles(selectedClientId || undefined)
  const deleteFileMutation = useDeleteContentFile()

  const selectedClient = golfCourses.find(c => c.id === selectedClientId)
  const currentContent = contentFiles.filter(f => f.file_category === activeContentTab)

  const handleFileUploadComplete = (fileId: string) => {
    toast({
      title: "Upload Complete",
      description: "File has been uploaded successfully",
    })
    setUploadMode(false)
    refetch()
  }

  const handleDeleteFile = (fileId: string) => {
    deleteFileMutation.mutate(fileId, {
      onSuccess: () => refetch()
    })
  }

  const handleScanForNewFolders = async () => {
    if (!selectedClient) {
      toast({
        title: "No Golf Course Selected",
        description: "Please select a golf course first",
        variant: "destructive"
      })
      return
    }

    setIsScanning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session')
      }

      // Try scanning with different prefixes to find nested tile structures
      // PRIORITIZE the correct path based on user's actual folder structure
      const scanPrefixes = [
        'phytomaps-files/Worlds_Best_Golf_Club/', // USER'S ACTUAL FOLDER STRUCTURE - PRIORITY #1
        'phytomaps-files/', // CLI upload prefix
        'Worlds_Best_Golf_Club/', // Direct golf course folder
        `phytomaps-files/${selectedClient.name.replace(/\s+/g, '_')}/`, // CLI upload with underscores
        '', // Root level scan (last resort)
      ]

      let allTileMaps: any[] = []
      let totalAutoAssigned = 0
      let totalAlreadyAssigned = 0

      for (const prefix of scanPrefixes) {
        try {
          console.log(`Scanning with prefix: "${prefix}"`)
          const url = new URL(`${SUPABASE_URL}/functions/v1/r2-list-folders`)
          if (prefix) {
            url.searchParams.set('prefix', prefix)
          }

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          })

          if (!response.ok) {
            console.warn(`Scan failed for prefix "${prefix}": ${response.status}`)
            continue
          }

          const result = await response.json()

          if (result.success && result.tileMaps?.length > 0) {
            console.log(`Found ${result.tileMaps.length} tile maps with prefix "${prefix}"`)
            allTileMaps.push(...result.tileMaps)
            totalAutoAssigned += result.tileMaps.filter((tm: any) => tm.autoAssigned).length
            totalAlreadyAssigned += result.tileMaps.filter((tm: any) => tm.alreadyAssigned).length
          }
        } catch (error) {
          console.warn(`Error scanning with prefix "${prefix}":`, error)
        }
      }

      // Show results from all scans
      const uniqueTileMaps = allTileMaps.filter((tm, index, self) =>
        index === self.findIndex(t => t.tileMapName === tm.tileMapName)
      )

      toast({
        title: "Folder Scan Complete",
        description: `Found ${uniqueTileMaps.length} unique tile maps. Auto-assigned: ${totalAutoAssigned}, Already assigned: ${totalAlreadyAssigned}`,
      })

      // Refresh the content files to show newly assigned folders
      refetch()
    } catch (error) {
      console.error('Error scanning for folders:', error)
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Failed to scan for new folders",
        variant: "destructive"
      })
    } finally {
      setIsScanning(false)
    }
  }

  const handleDeleteAllLiveMaps = async () => {
    if (!selectedClientId) return

    const liveMapsFiles = contentFiles.filter(f => f.file_category === 'live_maps')

    if (liveMapsFiles.length === 0) {
      toast({
        title: "No files to delete",
        description: "There are no Live Maps files to delete",
        variant: "destructive"
      })
      return
    }

    try {
      // Delete all live maps files one by one
      for (const file of liveMapsFiles) {
        deleteFileMutation.mutate(file.id)
      }

      toast({
        title: "Delete All Live Maps",
        description: `Successfully deleted ${liveMapsFiles.length} Live Maps files`,
      })

      // Refetch to update the UI
      setTimeout(() => refetch(), 1000)

    } catch (error) {
      toast({
        title: "Error deleting files",
        description: "Failed to delete some Live Maps files",
        variant: "destructive"
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (coursesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading golf courses...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Content Management</h1>
        <p className="text-muted-foreground">Upload and manage content for golf course clients</p>
      </div>


      {/* Client Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Select Golf Course
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {golfCourses.map((client) => (
              <Button
                key={client.id}
                variant={selectedClientId === client.id ? "teal" : "outline"}
                className="h-auto p-4 flex flex-col items-start"
                onClick={() => setSelectedClientId(client.id)}
              >
                <span className="font-semibold">{client.name}</span>
                <span className="text-xs opacity-70">
                  {client.location}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content Management */}
      {selectedClient && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>{selectedClient.name} - Content Management</CardTitle>
              <div className="flex items-center gap-2">
                {activeContentTab === 'live_maps' && viewMode === 'files' && currentContent.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteAllLiveMaps}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete All Live Maps
                  </Button>
                )}
                <Button
                  variant={viewMode === 'files' ? 'teal' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('files')}
                >
                  Files
                </Button>
                <Button
                  variant={viewMode === 'map' ? 'teal' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('map')}
                >
                  <Map className="h-4 w-4 mr-1" />
                  Map View
                </Button>
                <Button
                  variant="outline"
                  onClick={handleScanForNewFolders}
                  disabled={isScanning}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Scanning...' : 'Scan for New Folders'}
                </Button>
                <Button
                  variant="teal"
                  onClick={() => setUploadMode(true)}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Content
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === 'map' ? (
              <div className="flex flex-col gap-6 w-full relative z-10">
                <MapboxGolfCourseMap
                  golfCourseId={selectedClient.id.toString()}
                  mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''}
                  className="w-full"
                />
                <VectorLayerManager 
                  golfCourseId={selectedClient.id.toString()} 
                  isAdmin={true} 
                />
              </div>
            ) : (
              <Tabs value={activeContentTab} onValueChange={(value) => setActiveContentTab(value as any)}>
                <TabsList className="grid w-full grid-cols-4">
                  {contentTypes.map((type) => {
                    const Icon = type.icon
                    const count = contentFiles.filter(f => f.file_category === type.id).length
                    return (
                      <TabsTrigger key={type.id} value={type.id} className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${type.color}`} />
                        {type.name}
                        <Badge variant="secondary" className="ml-1">{count}</Badge>
                      </TabsTrigger>
                    )
                  })}
                </TabsList>

                {contentTypes.map((type) => (
                  <TabsContent key={type.id} value={type.id} className="mt-6">
                    {uploadMode && activeContentTab === type.id ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">Upload {type.name}</h3>
                          <Button variant="outline" onClick={() => setUploadMode(false)}>
                            Cancel
                          </Button>
                        </div>
                        <FileUploadManagerFixed
                          golfCourseId={selectedClient.id}
                          category={type.id as any}
                          onUploadComplete={handleFileUploadComplete}
                          maxFileSize={50000} // 50GB for all files
                          acceptedFormats={
                            type.id === 'reports' ? ['.pdf', '.doc', '.docx'] :
                              type.id === '3d_models' ? ['.obj', '.fbx', '.gltf', '.glb'] :
                                type.id === 'live_maps' ? ['.jpg', '.jpeg', '.png', '.zip', '.shp', '.shx', '.dbf', '.prj', '.geojson', '.json', '.tif', '.tiff'] :
                                  type.id === 'hd_maps' ? ['.jpg', '.jpeg', '.png'] :
                                    ['.jpg', '.jpeg', '.png']
                          }
                          enableGpsCapture={type.id === 'live_maps'}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filesLoading ? (
                          <div className="text-center p-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-teal mx-auto mb-2"></div>
                            <p className="text-sm text-muted-foreground">Loading files...</p>
                          </div>
                        ) : currentContent.length > 0 ? (
                          <div className="grid gap-4">
                            {currentContent.map((file) => (
                              <FileDownloader
                                key={file.id}
                                file={file}
                                showPreview={true}
                                variant="button"
                                showDelete={true}
                                onDelete={() => refetch()}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-center p-8 border-2 border-dashed border-border rounded-lg">
                            <type.icon className={`h-12 w-12 mx-auto mb-4 ${type.color} opacity-50`} />
                            <p className="text-muted-foreground">No {type.name.toLowerCase()} uploaded yet</p>
                            <Button
                              variant="outline"
                              className="mt-4"
                              onClick={() => setUploadMode(true)}
                            >
                              Upload First {type.name}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
