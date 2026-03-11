import { useState } from "react";
import { ClientHeader } from "@/components/ClientHeader";
import { DashboardTile } from "@/components/DashboardTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, FileText, Image, Box, Calendar, Activity, TrendingUp } from "lucide-react";
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
}
export const ClientDashboard = ({
  onLogout,
  onTileClick,
  golfCourseId,
  golfCourseName,
  userFullName,
  golfCourseLocation
}: ClientDashboardProps) => {
  const [uploadRefreshTrigger, setUploadRefreshTrigger] = useState(0);
  const {
    data: contentFiles = [],
    isLoading
  } = useContentFiles(golfCourseId);
  const getDashboardData = () => [{
    title: "Live Maps",
    description: "Interactive course mapping",
    icon: Map,
    count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'live_maps' && f.status === 'published').length,
    badge: contentFiles.filter(f => f.file_category === 'live_maps' && new Date(f.created_at || '').getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length > 0 ? `${contentFiles.filter(f => f.file_category === 'live_maps' && new Date(f.created_at || '').getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length} New` : undefined,
    section: "live-maps",
    status: "active"
  }, {
    title: "Reports",
    description: "Analysis & documentation",
    icon: FileText,
    count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'reports' && f.status === 'published').length,
    section: "reports",
    status: "active"
  }, {
    title: "HD Maps",
    description: "High-resolution imagery",
    icon: Image,
    count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'hd_maps' && f.status === 'published').length,
    section: "hd-maps",
    status: "active"
  }, {
    title: "3D Models",
    description: "Three-dimensional views",
    icon: Box,
    count: isLoading ? 0 : contentFiles.filter(f => f.file_category === '3d_models' && f.status === 'published').length,
    section: "3d-models",
    status: "active"
  }];
  const dashboardData = getDashboardData();
  const totalFiles = contentFiles.filter(f => f.status === 'published').length;
  const totalSize = contentFiles.reduce((sum, file) => sum + (file.file_size || 0), 0);
  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  };
  return <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
    <ClientHeader golfCourseName={golfCourseName} userName={userFullName} onLogout={onLogout} />

    <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
      {/* Welcome Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3 sm:gap-0">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mb-2">
              Welcome to {golfCourseName}
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-gray-950">
              Last updated {contentFiles.length > 0 ? new Date(Math.max(...contentFiles.map(f => new Date(f.created_at || '').getTime()))).toLocaleDateString() : 'Never'}
            </p>
          </div>
          <Badge variant="default" className="bg-success-green self-start sm:self-auto">
            <Activity className="h-3 w-3 mr-1" />
            <span className="text-xs sm:text-sm">All Systems Active</span>
          </Badge>
        </div>
        <p className="text-sm sm:text-base text-gray-950">
          Access your course mapping data, analysis reports, and 3D visualizations
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
        {/* Main Content Area */}
        <div className="xl:col-span-2 space-y-6 sm:space-y-8">
          {/* 4-Tile Grid Navigation */}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">Course Data Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {dashboardData.map(tile => <DashboardTile key={tile.section} title={tile.title} description={tile.description} icon={tile.icon} count={tile.count} badge={tile.badge} onClick={() => onTileClick(tile.section)} />)}
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

        {/* Sidebar */}
        <div className="space-y-4 sm:space-y-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contentFiles.slice(0, 4).map((file, index) => <div key={index} className="flex items-start gap-3 p-3 bg-background/50 rounded-lg">
                  <div className="p-2 rounded-full bg-primary-teal/10">
                    {file.file_category === 'live_maps' && <Map className="h-4 w-4 text-primary-teal" />}
                    {file.file_category === 'reports' && <FileText className="h-4 w-4 text-success-green" />}
                    {file.file_category === 'hd_maps' && <Image className="h-4 w-4 text-accent-teal" />}
                    {file.file_category === '3d_models' && <Box className="h-4 w-4 text-warning-amber" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{file.filename}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'Recently'}
                    </p>
                  </div>
                </div>)}
                {contentFiles.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>}
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Live Maps</span>
                  <Badge className="bg-success-green">Online</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Report System</span>
                  <Badge className="bg-success-green">Online</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">3D Renderer</span>
                  <Badge className="bg-success-green">Online</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Data Sync</span>
                  <Badge className="bg-success-green">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  </div>;
};