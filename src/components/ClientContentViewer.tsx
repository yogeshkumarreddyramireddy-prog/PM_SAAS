import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDownloader } from "@/components/FileDownloader";
import MapboxGolfCourseMap from "@/components/MapboxGolfCourseMap";
import { Map, FileText, Image, Box, Search, Filter, Calendar, MapPin, Grid, List, ArrowLeft } from "lucide-react";
import { useContentFiles } from "@/hooks/useSupabaseQuery";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
interface ClientContentViewerProps {
  golfCourseId: number;
  golfCourseName: string;
  onBack?: () => void;
}
const contentTypes = [{
  id: 'live_maps',
  name: 'Live Maps',
  icon: Map,
  color: 'text-blue-600'
}, {
  id: 'reports',
  name: 'Reports',
  icon: FileText,
  color: 'text-green-600'
}, {
  id: 'hd_maps',
  name: 'HD Maps',
  icon: Image,
  color: 'text-purple-600'
}, {
  id: '3d_models',
  name: '3D Models',
  icon: Box,
  color: 'text-orange-600'
}] as const;
export const ClientContentViewer = ({
  golfCourseId,
  golfCourseName,
  onBack
}: ClientContentViewerProps) => {
  const [activeTab, setActiveTab] = useState<'live_maps' | 'reports' | 'hd_maps' | '3d_models'>('live_maps');
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showMapView, setShowMapView] = useState(false);
  const isMobile = useIsMobile();
  const {
    data: contentFiles = [],
    isLoading
  } = useContentFiles(golfCourseId);
  const filteredFiles = contentFiles.filter(file => {
    const matchesSearch = file.filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || file.file_category === selectedCategory;
    const matchesTab = file.file_category === activeTab;
    const isPublished = file.status === 'published';
    return matchesSearch && matchesCategory && matchesTab && isPublished;
  });
  if (isLoading) {
    return <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading content...</p>
        </div>
      </div>;
  }
  return <div className="space-y-4 sm:space-y-6 px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack} size="sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Back</span>
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold text-white truncate">
              {golfCourseName}
            </h1>
            <p className="text-sm sm:text-base text-white/80 hidden sm:block">
              Access your mapping data and reports
            </p>
          </div>
        </div>
        <Button 
          variant={showMapView ? "teal" : "outline"} 
          onClick={() => setShowMapView(!showMapView)} 
          className="gap-2 self-start sm:self-auto"
          size={isMobile ? "sm" : "default"}
        >
          <Map className="h-4 w-4" />
          {showMapView ? 'Hide Map' : 'Show Map'}
        </Button>
      </div>

      {/* Map View */}
      {showMapView && (
        <div className="w-full mb-6 z-10 relative">
          <MapboxGolfCourseMap
            golfCourseId={golfCourseId.toString()}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search files..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  className="pl-10 w-full"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 justify-end sm:justify-start">
              <Button 
                variant={viewMode === 'grid' ? 'teal' : 'outline'} 
                size="sm" 
                onClick={() => setViewMode('grid')}
                className="flex-1 sm:flex-none"
              >
                <Grid className="h-4 w-4" />
                <span className="ml-1 sm:hidden">Grid</span>
              </Button>
              <Button 
                variant={viewMode === 'list' ? 'teal' : 'outline'} 
                size="sm" 
                onClick={() => setViewMode('list')}
                className="flex-1 sm:flex-none"
              >
                <List className="h-4 w-4" />
                <span className="ml-1 sm:hidden">List</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <Tabs value={activeTab} onValueChange={value => setActiveTab(value as any)}>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 h-auto p-1">
              {contentTypes.map(type => {
                const Icon = type.icon;
                const count = contentFiles.filter(f => f.file_category === type.id).length;
                return (
                  <TabsTrigger 
                    key={type.id} 
                    value={type.id} 
                    className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 p-2 sm:p-3 min-h-[60px] sm:min-h-[40px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    <Icon className={`h-4 w-4 ${type.color} data-[state=active]:text-primary-foreground`} />
                    <span className="text-xs sm:text-sm font-medium">{type.name}</span>
                    <Badge 
                      variant="secondary" 
                      className="text-xs px-1.5 py-0.5 data-[state=active]:bg-white/20 data-[state=active]:text-primary-foreground"
                    >
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {contentTypes.map(type => (
              <TabsContent key={type.id} value={type.id} className="mt-4 sm:mt-6">
                {filteredFiles.length > 0 ? (
                  <div className={`space-y-4 ${viewMode === 'grid' ? 'sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:space-y-0 sm:gap-4' : ''}`}>
                    {filteredFiles.map(file => (
                      <FileDownloader 
                        key={file.id} 
                        file={file} 
                        showPreview={true} 
                        variant="button" 
                        showDelete={false} 
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-6 sm:p-8 border-2 border-dashed border-border rounded-lg">
                    <type.icon className={`h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-4 ${type.color} opacity-50`} />
                    <p className="text-sm sm:text-base text-muted-foreground">
                      {searchTerm ? 'No files match your search' : `No ${type.name.toLowerCase()} available`}
                    </p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>;
};