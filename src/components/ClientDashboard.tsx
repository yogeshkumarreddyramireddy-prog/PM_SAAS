import { useState } from "react";
import { ClientHeader } from "@/components/ClientHeader";
import { DashboardTile } from "@/components/DashboardTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map, FileText, Image, Box, TrendingUp } from "lucide-react";
import { useContentFiles } from "@/hooks/useSupabaseQuery";
import { DroneImageUploader } from "@/components/DroneImageUploader";
import { RecentUploads } from "@/components/RecentUploads";
interface ClientDashboardProps {
  onLogout: () => void;
  onTileClick: (section: string) => void;
  golfCourseId: number;
  golfCourseName: string;
  userFullName?: string;
  golfCourseLocation?: string;
  assignedCourses?: any[];
  onCourseChange?: (id: number) => void;
}
export const ClientDashboard = ({
  onLogout,
  onTileClick,
  golfCourseId,
  golfCourseName,
  userFullName,
  golfCourseLocation,
  assignedCourses,
  onCourseChange
}: ClientDashboardProps) => {
  const [uploadRefreshTrigger, setUploadRefreshTrigger] = useState(0);
  const {
    data: contentFiles = [],
    isLoading
  } = useContentFiles(golfCourseId);
  const getNewFilesCount = (category: string, sectionAlias: string) => {
    const lastVisitedStr = localStorage.getItem(`last_visited_${sectionAlias}_${golfCourseId}`);
    const lastVisited = lastVisitedStr ? parseInt(lastVisitedStr, 10) : 0;
    
    return contentFiles.filter(f => {
      if (f.file_category !== category || f.status !== 'published') return false;
      const createdAt = new Date(f.created_at || '').getTime();
      return createdAt > (Date.now() - 7 * 24 * 60 * 60 * 1000) && createdAt > lastVisited;
    }).length;
  };

  const getDashboardData = () => {
    const liveMapsNew = getNewFilesCount('live_maps', 'live-maps');
    const reportsNew = getNewFilesCount('reports', 'reports');
    const hdMapsNew = getNewFilesCount('hd_maps', 'hd-maps');
    const modelsNew = getNewFilesCount('3d_models', '3d-models');

    return [
      {
        title: "Live Maps",
        description: "Interactive course mapping",
        icon: Map,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'live_maps' && f.status === 'published').length,
        badge: liveMapsNew > 0 ? `${liveMapsNew} New` : undefined,
        section: "live-maps",
        status: "active"
      },
      {
        title: "Reports",
        description: "Analysis & documentation",
        icon: FileText,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'reports' && f.status === 'published').length,
        badge: reportsNew > 0 ? `${reportsNew} New` : undefined,
        section: "reports",
        status: "active"
      },
      {
        title: "HD Maps",
        description: "High-resolution imagery",
        icon: Image,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'hd_maps' && f.status === 'published').length,
        badge: hdMapsNew > 0 ? `${hdMapsNew} New` : undefined,
        section: "hd-maps",
        status: "active"
      },
      {
        title: "3D Models",
        description: "Three-dimensional views",
        icon: Box,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === '3d_models' && f.status === 'published').length,
        badge: modelsNew > 0 ? `${modelsNew} New` : undefined,
        section: "3d-models",
        status: "active"
      }
    ];
  };
  const dashboardData = getDashboardData();
  
  const handleTileClick = (section: string) => {
    localStorage.setItem(`last_visited_${section}_${golfCourseId}`, Date.now().toString());
    onTileClick(section);
  };
  const totalFiles = contentFiles.filter(f => f.status === 'published').length;
  const totalSize = contentFiles.reduce((sum, file) => sum + (file.file_size || 0), 0);
  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  };
  return <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
    <ClientHeader 
      golfCourseName={golfCourseName} 
      userName={userFullName} 
      onLogout={onLogout} 
      activeCourseId={golfCourseId}
      assignedCourses={assignedCourses}
      onCourseChange={onCourseChange}
    />

    <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
      <div className="grid grid-cols-1 gap-6 sm:gap-8">
        {/* Main Content Area */}
        <div className="space-y-6 sm:space-y-8">
          {/* 4-Tile Grid Navigation */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">Course Data Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {dashboardData.map(tile => <DashboardTile key={tile.section} title={tile.title} description={tile.description} icon={tile.icon} count={tile.count} badge={tile.badge} onClick={() => handleTileClick(tile.section)} />)}
            </div>
          </div>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                Course Data Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary-teal mb-1">{totalFiles}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Total Files</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-success-green mb-1">{contentFiles.filter(f => f.file_category === 'live_maps').length}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Maps Available</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-accent-teal mb-1">{formatSize(totalSize)}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Data Size</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-warning-amber mb-1">{totalFiles > 0 ? '100%' : '0%'}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Available</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Drone Image Upload */}
          <div className="mt-8">
            <DroneImageUploader
              golfCourseId={golfCourseId}
              golfCourseName={golfCourseName}
              onUploadComplete={() => setUploadRefreshTrigger(prev => prev + 1)}
            />
          </div>

          {/* Recent Uploads */}
          <div className="mt-6">
            <RecentUploads
              golfCourseId={golfCourseId}
              golfCourseName={golfCourseName}
              refreshTrigger={uploadRefreshTrigger}
            />
          </div>
        </div>

      </div>
    </main>
  </div>;
};