
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Map, FileText, Image, Box, Calendar, Download, Trash2, Eye, Upload } from "lucide-react"
import { useContentFiles, useContentCategories, useDeleteContentFile } from "@/hooks/useSupabaseQuery"
import { AdminClientRawUploads } from "./AdminClientRawUploads"

interface AdminClientContentProps {
  client: {
    id: number
    name: string
    location: string | null
  }
  onBack: () => void
}

export const AdminClientContent = ({ client, onBack }: AdminClientContentProps) => {
  const [activeTab, setActiveTab] = useState('raw_uploads') // Default to Raw Uploads tab

  const { data: contentFiles = [], isLoading } = useContentFiles(client.id)
  const { data: categories = [] } = useContentCategories()
  const deleteFileMutation = useDeleteContentFile()

  const getCategoryFiles = (categoryId: number) => {
    return contentFiles.filter(file => file.category_id === categoryId)
  }

  const getCategoryIcon = (categoryName: string) => {
    switch (categoryName) {
      case 'Live Maps': return Map
      case 'Reports': return FileText
      case 'HD Maps': return Image
      case '3D Models': return Box
      default: return FileText
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleDeleteFile = (fileId: string) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      deleteFileMutation.mutate(fileId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading content...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{client.name}</h1>
          <p className="text-muted-foreground">Content Management - {client.location}</p>
        </div>
      </div>

      {/* Content Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Content Library</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${(categories?.length || 0) + 1}, 1fr)` }}>
              <TabsTrigger value="raw_uploads" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Raw Uploads
              </TabsTrigger>
              {categories.map((category) => {
                const Icon = getCategoryIcon(category.name)
                const count = getCategoryFiles(category.id).length
                return (
                  <TabsTrigger key={category.id} value={category.id.toString()} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {category.name}
                    <Badge variant="secondary" className="ml-1">{count}</Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <TabsContent value="raw_uploads" className="mt-6">
              <AdminClientRawUploads golfCourseId={client.id} golfCourseName={client.name} />
            </TabsContent>

            {categories.map((category) => {
              const Icon = getCategoryIcon(category.name)
              const categoryFiles = getCategoryFiles(category.id)

              return (
                <TabsContent key={category.id} value={category.id.toString()} className="mt-6">
                  <div className="space-y-4">
                    {categoryFiles.length > 0 ? (
                      <div className="grid gap-4">
                        {categoryFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
                            <div className="flex items-center gap-4">
                              <div className="p-2 rounded-lg bg-primary-teal/10">
                                <Icon className="h-5 w-5 text-primary-teal" />
                              </div>
                              <div>
                                <p className="font-semibold">{file.filename}</p>
                                <p className="text-sm text-muted-foreground">
                                  {file.mime_type} • {formatFileSize(file.file_size || 0)}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(file.created_at)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <Badge
                                variant={file.status === 'published' ? 'default' : 'secondary'}
                                className={file.status === 'published' ? 'bg-success-green' : ''}
                              >
                                {file.status}
                              </Badge>

                              <div className="flex gap-1">
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="sm">
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteFile(file.id)}
                                  disabled={deleteFileMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center p-8 border-2 border-dashed border-border rounded-lg">
                        <Icon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No {category.name.toLowerCase()} uploaded yet</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
