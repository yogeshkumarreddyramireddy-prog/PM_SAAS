import { PMVHeader } from "@/components/PMVHeader"
import { DashboardTile } from "@/components/DashboardTile"
import { Map, FileText, Image, Box } from "lucide-react"
import { useContentFiles } from "@/hooks/useSupabaseQuery"

interface ClientDashboardProps {
  onLogout: () => void
  onTileClick: (section: string) => void
  userFullName: string
  golfCourseName: string
  golfCourseLocation?: string
  golfCourseId: number
}

export const ClientDashboard = ({ onLogout, onTileClick, userFullName, golfCourseName, golfCourseLocation, golfCourseId }: ClientDashboardProps) => {
  const { data: contentFiles = [], isLoading } = useContentFiles(golfCourseId)

  // Categorize files
  const liveMaps = contentFiles.filter((f: any) => f.content_categories?.name === 'Live Maps')
  const reports = contentFiles.filter((f: any) => f.content_categories?.name === 'Reports')
  const hdMaps = contentFiles.filter((f: any) => f.content_categories?.name === 'HD Maps')
  const models3d = contentFiles.filter((f: any) => f.content_categories?.name === '3D Models')

  // Calculate stats
  const totalFiles = contentFiles.length
  const dataSize = contentFiles.reduce((sum: number, f: any) => sum + (f.size_bytes || 0), 0)
  const lastUpdate = contentFiles.length > 0 ? new Date(Math.max(...contentFiles.map((f: any) => new Date(f.updated_at || f.created_at).getTime()))).toLocaleDateString() : 'Never'

  const dashboardData = [
    {
      title: "Live Maps",
      description: "Interactive course mapping",
      icon: Map,
      count: liveMaps.length,
      section: "live-maps"
    },
    {
      title: "Reports",
      description: "Analysis & documentation",
      icon: FileText,
      count: reports.length,
      section: "reports"
    },
    {
      title: "HD Maps",
      description: "High-resolution imagery",
      icon: Image,
      count: hdMaps.length,
      section: "hd-maps"
    },
    {
      title: "3D Models",
      description: "Three-dimensional views",
      icon: Box,
      count: models3d.length,
      section: "3d-models"
    }
  ]

  return (
    <div className="min-h-screen">
      <PMVHeader
        userType="client"
        userInfo={{ name: userFullName, role: golfCourseName }}
        onLogout={onLogout}
      />
      <main className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            Welcome to {golfCourseName} Dashboard
          </h1>
          {golfCourseLocation && (
            <p className="text-xl text-white/80">{golfCourseLocation}</p>
          )}
          <p className="text-white/70 mt-2">
            Access your course mapping data, analysis reports, and 3D visualizations
          </p>
        </div>

        {/* 4-Tile Grid Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {dashboardData.map((tile) => (
            <DashboardTile
              key={tile.section}
              title={tile.title}
              description={tile.description}
              icon={tile.icon}
              count={tile.count}
              onClick={() => onTileClick(tile.section)}
            />
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-12 bg-white/10 backdrop-blur-sm rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-xl font-semibold text-white mb-4 text-center">
            Course Data Overview
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-accent-teal">{totalFiles}</p>
              <p className="text-sm text-white/70">Total Files</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-teal">{liveMaps.length + hdMaps.length}</p>
              <p className="text-sm text-white/70">Maps Available</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-teal">{(dataSize / (1024*1024)).toFixed(1)} MB</p>
              <p className="text-sm text-white/70">Data Size</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-teal">{lastUpdate}</p>
              <p className="text-sm text-white/70">Last Update</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}