import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDownloader } from "@/components/FileDownloader";
import MapboxGolfCourseMap from "@/components/MapboxGolfCourseMap";
import { Map, FileText, Image, Box, Search, ArrowLeft, MapPin } from "lucide-react";
import { useContentFiles } from "@/hooks/useSupabaseQuery";
interface ClientContentSectionProps {
  golfCourseId: number;
  golfCourseName: string;
  contentType: 'live_maps' | 'reports' | 'hd_maps' | '3d_models';
  onBack?: () => void;
}
const contentTypeConfig = {
  live_maps: {
    name: 'Live Maps',
    icon: Map,
    color: 'text-blue-600',
    description: 'Real-time interactive maps and overlays'
  },
  reports: {
    name: 'Reports',
    icon: FileText,
    color: 'text-green-600',
    description: 'Detailed analysis and documentation'
  },
  hd_maps: {
    name: 'HD Maps',
    icon: Image,
    color: 'text-purple-600',
    description: 'High-definition aerial imagery'
  },
  '3d_models': {
    name: '3D Models',
    icon: Box,
    color: 'text-orange-600',
    description: 'Three-dimensional course representations'
  }
};
export const ClientContentSection = ({
  golfCourseId,
  golfCourseName,
  contentType,
  onBack
}: ClientContentSectionProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showMapView, setShowMapView] = useState(contentType === 'live_maps');
  const {
    data: contentFiles = [],
    isLoading
  } = useContentFiles(golfCourseId);
  const config = contentTypeConfig[contentType];
  const Icon = config.icon;
  const filteredFiles = contentFiles.filter(file => {
    const matchesSearch = file.filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = file.file_category === contentType;
    const isPublished = file.status === 'published';
    return matchesSearch && matchesType && isPublished;
  });
  if (isLoading) {
    return <div className="flex items-center justify-center p-8">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading content...</p>
      </div>
    </div>;
  }
  return <div className="space-y-6">
    {/* Header */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {onBack && <Button variant="outline" onClick={onBack} size="sm" className="mx-[10px]">
          <ArrowLeft className="h-4 w-4" />
        </Button>}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Icon className={`h-6 w-6 ${config.color}`} />
            <h1 className="font-bold my-[10px] text-5xl text-slate-50">{config.name}</h1>
          </div>


        </div>
      </div>

      {contentType === 'live_maps' && <Button variant={showMapView ? "teal" : "outline"} onClick={() => setShowMapView(!showMapView)} className="gap-2 mx-[10px]">
        <Map className="h-4 w-4" />
        {showMapView ? 'Hide Map' : 'Show Map'}
      </Button>}
    </div>

    {/* Map View */}
    {showMapView && contentType === 'live_maps' && (
      <div className="w-full h-[600px] mb-6 rounded-lg overflow-hidden border border-border mx-[15px] max-w-[calc(100%-30px)]">
        <MapboxGolfCourseMap
          golfCourseId={golfCourseId.toString()}
          mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''}
          className="w-full h-full"
        />
      </div>
    )}

    {/* Search and Controls */}
    <Card className="mx-[15px]">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search files..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Content Files */}
    <Card className="mx-[15px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${config.color}`} />
          Available {config.name}
          <span className="text-sm font-normal text-muted-foreground">
            ({filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filteredFiles.length > 0 ? <div className="space-y-4">
          {filteredFiles.map(file => <FileDownloader key={file.id} file={file} showPreview={true} variant="button" showDelete={false} />)}
        </div> : <div className="text-center p-8 border-2 border-dashed border-border rounded-lg">
          <Icon className={`h-12 w-12 mx-auto mb-4 ${config.color} opacity-50`} />
          <p className="text-muted-foreground">
            {searchTerm ? 'No files match your search' : `No ${config.name.toLowerCase()} available`}
          </p>
        </div>}
      </CardContent>
    </Card>
  </div>;
};