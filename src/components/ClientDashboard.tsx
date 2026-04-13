import { useState, useEffect } from "react";
import { ClientHeader } from "@/components/ClientHeader";
import { DashboardTile } from "@/components/DashboardTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map, FileText, Image, Box, TrendingUp, HelpCircle } from "lucide-react";
import { useContentFiles } from "@/hooks/useSupabaseQuery";
import { DroneImageUploader } from "@/components/DroneImageUploader";
import { RecentUploads } from "@/components/RecentUploads";
import { useT } from "@/translations";
import { supabase } from "@/integrations/supabase/client";
import { Joyride, Step, EventData, STATUS } from "react-joyride";

interface ClientDashboardProps {
  onLogout: () => void;
  onTileClick: (section: string) => void;
  golfCourseId: number;
  golfCourseName: string;
  userFullName?: string;
  golfCourseLocation?: string;
  assignedCourses?: { id: number; name: string }[];
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
  const [liveMapCount, setLiveMapCount] = useState(0);
  const {
    data: contentFiles = [],
    isLoading
  } = useContentFiles(golfCourseId);
  const t = useT();

  const [runTour, setRunTour] = useState(false);
  const [tourSteps] = useState<Step[]>([
    {
      target: 'body',
      title: 'Welcome to your Dashboard!',
      content: 'Would you like a quick tour of where to find your maps, reports, and 3D models?',
      placement: 'center',
    },
    {
      target: '#tour-main-grid',
      title: 'Navigation Grid',
      content: 'Access your interactive map layers, download PDF reports, or view 3D models from this central grid.',
      placement: 'bottom',
    },
    {
      target: '#tour-quick-stats',
      title: 'Quick Stats',
      content: 'Keep track of your total files, maps available, and data storage volume at a glance.',
      placement: 'bottom',
    },
    {
      target: '#tour-drone-upload',
      title: 'Submit New Data',
      content: 'Need to provide us with new drone imagery? You can securely upload your raw data right here.',
      placement: 'top',
    },
    {
      target: '#tour-recent-uploads',
      title: 'Upload Status',
      content: 'Check here to see the processing status of your recent uploads and view newly published data.',
      placement: 'top',
    },
    {
      target: '#tour-course-selector',
      title: 'Switch Courses',
      content: 'Manage multiple sites? Switch between your assigned golf courses using this dropdown menu.',
      placement: 'bottom',
    }
  ]);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('phytomaps_tour_completed');
    if (!hasSeenTour) {
      setTimeout(() => {
        setRunTour(true);
        // Set this immediately so navigating away before finishing doesn't cause it to restart
        localStorage.setItem('phytomaps_tour_completed', 'true');
      }, 1500);
    }
  }, []);

  const handleJoyrideCallback = (data: EventData) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('phytomaps_tour_completed', 'true');
    }
  };

  useEffect(() => {
    // Reset immediately so we never show stale data from the previous course
    setLiveMapCount(0);

    const fetchMapCounts = async () => {
      // Count ONLY from the dedicated map tables.
      // content_files with file_category='live_maps' are mirror records created
      // alongside golf_course_tilesets entries (same data, stored twice).
      // Adding them here would double-count every map layer.
      const [{ count: rasterCount }, { count: healthCount }, { count: vectorCount }] =
        await Promise.all([
          supabase
            .from('golf_course_tilesets')
            .select('*', { count: 'exact', head: true })
            .eq('golf_course_id', golfCourseId)
            .eq('is_active', true),
          supabase
            .from('health_map_tilesets')
            .select('*', { count: 'exact', head: true })
            .eq('golf_course_id', golfCourseId)
            .eq('is_active', true),
          supabase
            .from('vector_layers')
            .select('*', { count: 'exact', head: true })
            .eq('golf_course_id', golfCourseId)
            .eq('is_active', true),
        ]);

      setLiveMapCount((rasterCount || 0) + (healthCount || 0) + (vectorCount || 0));
    };

    fetchMapCounts();
    // Only re-run when the selected course changes — not on every contentFiles update
  }, [golfCourseId]);

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
        title: t.tiles.liveMapsTitle,
        description: t.tiles.liveMapsDesc,
        icon: Map,
        count: isLoading ? 0 : liveMapCount,
        badge: liveMapsNew > 0 ? `${liveMapsNew} ${t.dashboard.badgeNew}` : undefined,
        section: "live-maps",
        status: "active"
      },
      {
        title: t.tiles.reportsTitle,
        description: t.tiles.reportsDesc,
        icon: FileText,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'reports' && f.status === 'published').length,
        badge: reportsNew > 0 ? `${reportsNew} ${t.dashboard.badgeNew}` : undefined,
        section: "reports",
        status: "active"
      },
      {
        title: t.tiles.hdMapsTitle,
        description: t.tiles.hdMapsDesc,
        icon: Image,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === 'hd_maps' && f.status === 'published').length,
        badge: hdMapsNew > 0 ? `${hdMapsNew} ${t.dashboard.badgeNew}` : undefined,
        section: "hd-maps",
        status: "active"
      },
      {
        title: t.tiles.modelsTitle,
        description: t.tiles.modelsDesc,
        icon: Box,
        count: isLoading ? 0 : contentFiles.filter(f => f.file_category === '3d_models' && f.status === 'published').length,
        badge: modelsNew > 0 ? `${modelsNew} ${t.dashboard.badgeNew}` : undefined,
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

  // Exclude live_maps from the COUNT to avoid double-counting with liveMapCount
  // (those entries are mirror records of golf_course_tilesets).
  // But include ALL published files in the SIZE — the live_maps source files
  // (drone imagery, GeoTIFFs, etc.) represent the bulk of actual data volume.
  const nonMapFiles = contentFiles.filter(
    f => f.status === 'published' && f.file_category !== 'live_maps'
  );
  const totalFiles = nonMapFiles.length;
  const totalSize = contentFiles
    .filter(f => f.status === 'published')
    .reduce((sum, file) => sum + (file.file_size || 0), 0);
  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous={true}
        onEvent={handleJoyrideCallback}
        locale={{
          back: 'Back',
          close: 'Close',
          last: 'Finish Tour',
          next: 'Next',
          skip: 'Skip Tour'
        }}
        options={{
          primaryColor: '#0d9488',
          textColor: '#334155',
          backgroundColor: '#ffffff',
          arrowColor: '#ffffff',
          overlayColor: 'rgba(0, 0, 0, 0.6)',
          showProgress: true,
          skipBeacon: true,
          overlayClickAction: false,
          buttons: ['back', 'primary', 'skip']
        }}
        styles={{
          tooltipContainer: {
            textAlign: 'left',
          },
          buttonPrimary: {
            backgroundColor: '#0d9488',
            borderRadius: '4px',
          },
          buttonBack: {
            color: '#64748b',
          }
        }}
      />
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
              <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">
                {t.dashboard.sectionHeading}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" id="tour-main-grid">
                {dashboardData.map(tile => (
                  <DashboardTile
                    key={tile.section}
                    title={tile.title}
                    description={tile.description}
                    icon={tile.icon}
                    count={tile.count}
                    badge={tile.badge}
                    onClick={() => handleTileClick(tile.section)}
                  />
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <Card id="tour-quick-stats">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                  {t.dashboard.statsTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary-teal mb-1">{totalFiles}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{t.dashboard.statsTotalFiles}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-success-green mb-1">{liveMapCount}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{t.dashboard.statsMapsAvailable}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-accent-teal mb-1">{formatSize(totalSize)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{t.dashboard.statsDataSize}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-warning-amber mb-1">{(totalFiles > 0 || liveMapCount > 0) ? '100%' : '0%'}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{t.dashboard.statsAvailable}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Drone Image Upload */}
            <div className="mt-8" id="tour-drone-upload">
              <DroneImageUploader
                golfCourseId={golfCourseId}
                golfCourseName={golfCourseName}
                onUploadComplete={() => setUploadRefreshTrigger(prev => prev + 1)}
              />
            </div>

            {/* Recent Uploads */}
            <div className="mt-6" id="tour-recent-uploads">
              <RecentUploads
                golfCourseId={golfCourseId}
                golfCourseName={golfCourseName}
                refreshTrigger={uploadRefreshTrigger}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Floating Tour Button */}
      <Button
        onClick={() => setRunTour(true)}
        className="fixed bottom-6 right-6 rounded-full shadow-lg z-50 flex items-center gap-2 bg-primary-teal hover:bg-primary-teal/90 text-white px-4 py-2 cursor-pointer transition-transform hover:scale-105"
      >
        <HelpCircle className="h-5 w-5" />
        <span className="font-semibold">Take a Tour</span>
      </Button>
    </div>
  );
};