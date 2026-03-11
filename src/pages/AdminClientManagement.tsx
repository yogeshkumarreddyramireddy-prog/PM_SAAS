import { useState } from "react"
import { PMVHeader } from "@/components/PMVHeader"
import { FileUploadZone } from "@/components/FileUploadZone"
import { DirectR2FolderUpload } from "@/components/DirectR2FolderUpload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, MessageSquare, FileType } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"

interface AdminClientManagementProps {
  clientId: number
  onBack: () => void
  onLogout: () => void
}

// Mock client data
const getClientById = (id: number) => ({
  id,
  name: "Augusta National Golf Club",
  location: "Georgia, USA",
  lastUpload: "2024-01-15"
})

export const AdminClientManagement = ({ clientId, onBack, onLogout }: AdminClientManagementProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, any[]>>({
    'live-maps': [
      { id: '1', name: 'hole-1-live.pdf', size: 2048000, uploadDate: '2024-01-15' },
      { id: '2', name: 'hole-2-live.tiff', size: 5120000, uploadDate: '2024-01-14' }
    ],
    'reports': [
      { id: '3', name: 'monthly-analysis.pdf', size: 1024000, uploadDate: '2024-01-10' }
    ],
    'hd-maps': [],
    '3d-models': []
  })
  const [selectedTileFiles, setSelectedTileFiles] = useState<File[]>([])
  const [showFolderUpload, setShowFolderUpload] = useState(false)
  const { toast } = useToast()

  const client = getClientById(clientId)

  const handleFilesUpload = (category: string, files: File[]) => {
    const newFiles = files.map(file => ({
      id: Date.now().toString() + Math.random(),
      name: file.name,
      size: file.size,
      uploadDate: new Date().toISOString().split('T')[0]
    }))

    setUploadedFiles(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), ...newFiles]
    }))
  }

  const handleTileFolderUpload = async () => {
    if (selectedTileFiles.length === 0) return

    try {
      // Prepare file data for batch upload
      const fileData = []
      
      for (const file of selectedTileFiles) {
        const relativePath = file.webkitRelativePath.split('/').slice(1).join('/') // Remove folder name
        const content = await convertFileToBase64(file)
        
        fileData.push({
          relativePath,
          content,
          contentType: file.type
        })
      }

      // Upload to R2 via Supabase edge function
      const { data, error } = await supabase.functions.invoke('r2-direct-upload', {
        body: {
          golfCourseName: client.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
          files: fileData
        }
      })

      if (error) {
        throw new Error(error.message)
      }

      if (!data.success) {
        throw new Error(data.error || 'Upload failed')
      }

      toast({
        title: "Folder upload successful",
        description: `${selectedTileFiles.length} tiles uploaded to R2`,
      })

      setSelectedTileFiles([])
      setShowFolderUpload(false)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive"
      })
    }
  }

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const uploadSections = [
    {
      id: 'live-maps',
      title: 'Live Maps',
      description: 'Interactive course mapping files',
      formats: ['.pdf', '.tif','.tiff', '.png', '.jpg']
    },
    {
      id: 'reports',
      title: 'Reports',
      description: 'Analysis and documentation PDFs',
      formats: ['.pdf']
    },
    {
      id: 'hd-maps',
      title: 'HD Maps',
      description: 'High-resolution course imagery',
      formats: ['.tiff', '.tif','.png', '.jpg']
    },
    {
      id: '3d-models',
      title: '3D Models',
      description: 'Three-dimensional course models',
      formats: ['.obj', '.glb', '.fbx']
    }
  ]

  return (
    <div className="min-h-screen">
      <PMVHeader
        userType="admin"
        userInfo={{ name: "Admin User", role: "Platform Administrator" }}
        onLogout={onLogout}
      />
      
      <main className="container mx-auto px-6 py-8">
        {/* Header with Back Button */}
        <div className="mb-8">
          <Button 
            variant="teal-outline" 
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
          
          <h1 className="text-3xl font-bold text-white mb-2">
            File Management
          </h1>
          <p className="text-white/80">
            Managing files for <span className="font-semibold">{client.name}</span> • {client.location}
          </p>
        </div>

        {/* Folder Upload Modal */}
        {showFolderUpload && selectedTileFiles.length > 0 && (
          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Confirm Tile Folder Upload</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Selected {selectedTileFiles.length} tile files for upload to R2
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={handleTileFolderUpload} variant="teal">
                    Upload to R2
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowFolderUpload(false)
                      setSelectedTileFiles([])
                    }} 
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upload Sections Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {uploadSections.map((section) => (
            section.id === 'live-maps' ? (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileType className="h-5 w-5 text-primary-teal" />
                    {section.title}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Individual File Upload */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Upload Individual Files</h4>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center border-border hover:border-primary-teal/50">
                      <Button 
                        variant="teal-outline" 
                        size="sm"
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.multiple = true
                          input.accept = section.formats.join(',')
                          input.onchange = (e) => {
                            const files = Array.from((e.target as HTMLInputElement).files || [])
                            handleFilesUpload(section.id, files)
                          }
                          input.click()
                        }}
                      >
                        Select Files
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Supported: {section.formats.join(', ')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Folder Upload for Raster Tiles */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Upload Raster Tile Folder</h4>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center border-border hover:border-primary-teal/50">
                      <Button 
                        variant="teal" 
                        size="sm"
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.setAttribute('webkitdirectory', '')
                          input.multiple = true
                          input.onchange = (e) => {
                            const files = Array.from((e.target as HTMLInputElement).files || [])
                            const tileFiles = files.filter(file => 
                              /\.(png|jpg|jpeg)$/i.test(file.name) && 
                              file.webkitRelativePath.includes('/')
                            )
                            if (tileFiles.length > 0) {
                              // Use DirectR2FolderUpload logic
                              setSelectedTileFiles(tileFiles)
                              setShowFolderUpload(true)
                            }
                          }
                          input.click()
                        }}
                      >
                        Select Tile Folder
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Direct upload to R2 for raster tiles (z/x/y structure)
                      </p>
                    </div>
                  </div>

                  {/* Uploaded Files List */}
                  {uploadedFiles[section.id] && uploadedFiles[section.id].length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Uploaded Files ({uploadedFiles[section.id].length})</h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {uploadedFiles[section.id].map((file) => (
                          <div 
                            key={file.id}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded border"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-sm">{file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {file.uploadDate}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <FileUploadZone
                key={section.id}
                title={section.title}
                description={section.description}
                acceptedFormats={section.formats}
                uploadedFiles={uploadedFiles[section.id] || []}
                onFilesUpload={(files) => handleFilesUpload(section.id, files)}
              />
            )
          ))}
        </div>

        {/* Comments Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary-teal" />
              Client Notes & Comments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-l-4 border-primary-teal pl-4 py-2">
                <p className="text-sm">
                  <strong>Jan 15, 2024:</strong> Updated live maps for holes 1-9. 
                  New irrigation system data included.
                </p>
                <p className="text-xs text-muted-foreground">Admin User</p>
              </div>
              
              <div className="border-l-4 border-muted pl-4 py-2">
                <p className="text-sm">
                  <strong>Jan 10, 2024:</strong> Monthly analysis report completed. 
                  Showing improvements in course conditions.
                </p>
                <p className="text-xs text-muted-foreground">Admin User</p>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a comment about this client's files..."
                  className="flex-1 px-3 py-2 border rounded-md bg-white/80"
                />
                <Button variant="teal" size="sm">
                  Add Comment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}