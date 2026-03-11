import { PMVHeader } from "@/components/PMVHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Map, FileText, Image, Box, Download, Eye } from "lucide-react"

interface ClientSectionProps {
  section: string
  onBack: () => void
  onLogout: () => void
}

// Mock data for different sections
const sectionData = {
  'live-maps': {
    title: 'Live Maps',
    icon: Map,
    description: 'Interactive course mapping and real-time data',
    items: [
      { id: 1, name: 'Hole 1-9 Live Map', type: 'Interactive', lastUpdate: '2024-01-15', size: '2.4 MB' },
      { id: 2, name: 'Hole 10-18 Live Map', type: 'Interactive', lastUpdate: '2024-01-12', size: '2.1 MB' },
      { id: 3, name: 'Full Course Overview', type: 'Interactive', lastUpdate: '2024-01-10', size: '4.2 MB' }
    ]
  },
  'reports': {
    title: 'Reports',
    icon: FileText,
    description: 'Analysis reports and documentation',
    items: [
      { id: 1, name: 'Monthly Course Analysis', type: 'PDF', lastUpdate: '2024-01-15', size: '1.8 MB' },
      { id: 2, name: 'Irrigation Efficiency Report', type: 'PDF', lastUpdate: '2024-01-10', size: '2.2 MB' },
      { id: 3, name: 'Turf Health Assessment', type: 'PDF', lastUpdate: '2024-01-05', size: '3.1 MB' }
    ]
  },
  'hd-maps': {
    title: 'HD Maps',
    icon: Image,
    description: 'High-resolution course imagery and detailed maps',
    items: [
      { id: 1, name: 'Aerial Course View 4K', type: 'TIFF', lastUpdate: '2024-01-14', size: '45.2 MB' },
      { id: 2, name: 'Green Details HD Collection', type: 'PNG', lastUpdate: '2024-01-12', size: '28.7 MB' },
      { id: 3, name: 'Fairway Mapping HD', type: 'TIFF', lastUpdate: '2024-01-08', size: '52.1 MB' }
    ]
  },
  '3d-models': {
    title: '3D Models',
    icon: Box,
    description: 'Three-dimensional course models and visualizations',
    items: [
      { id: 1, name: 'Full Course 3D Model', type: 'GLB', lastUpdate: '2024-01-13', size: '156.8 MB' },
      { id: 2, name: 'Clubhouse 3D View', type: 'OBJ', lastUpdate: '2024-01-09', size: '89.4 MB' },
      { id: 3, name: 'Signature Holes 3D', type: 'FBX', lastUpdate: '2024-01-07', size: '124.2 MB' }
    ]
  }
}

export const ClientSection = ({ section, onBack, onLogout }: ClientSectionProps) => {
  const currentSection = sectionData[section as keyof typeof sectionData]
  
  if (!currentSection) {
    return <div>Section not found</div>
  }

  const { title, icon: Icon, description, items } = currentSection

  return (
    <div className="min-h-screen">
      <PMVHeader
        userType="client"
        userInfo={{ name: "Augusta National Golf Club", role: "Golf Course" }}
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
            Back to Dashboard
          </Button>
          
          <div className="flex items-center gap-4 mb-4">
            <Icon className="h-8 w-8 text-accent-teal" />
            <div>
              <h1 className="text-3xl font-bold text-white">
                {title}
              </h1>
              <p className="text-white/80">
                {description}
              </p>
            </div>
          </div>
        </div>

        {/* Section Content */}
        <div className="space-y-6">
          {section === 'live-maps' && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Interactive Map Viewer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/20 rounded-lg p-8 text-center">
                  <Map className="h-16 w-16 mx-auto mb-4 text-primary-teal" />
                  <p className="text-lg font-medium mb-2">Interactive Map Integration</p>
                  <p className="text-muted-foreground">
                    Live mapping interface will be integrated here
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Files List */}
          <Card>
            <CardHeader>
              <CardTitle>Available {title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {items.length} items available for viewing and download
              </p>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:shadow-card transition-smooth"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold">{item.name}</h3>
                      <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                        <span>Type: {item.type}</span>
                        <span>Size: {item.size}</span>
                        <span>Updated: {item.lastUpdate}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <Button variant="teal-outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 3D Model Viewer for 3D Models section */}
          {section === '3d-models' && (
            <Card>
              <CardHeader>
                <CardTitle>3D Model Viewer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/20 rounded-lg p-8 text-center">
                  <Box className="h-16 w-16 mx-auto mb-4 text-primary-teal" />
                  <p className="text-lg font-medium mb-2">3D Model Integration</p>
                  <p className="text-muted-foreground">
                    Three.js 3D model viewer will be integrated here
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}