import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Users, Activity, Download, Clock, TrendingUp, Eye, FileText } from "lucide-react"
import { useGolfCourses, useUserProfiles } from "@/hooks/useSupabaseQuery"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { format, formatDistanceToNow } from "date-fns"

export const AdminAnalytics = () => {
  // Fetch real data
  const { data: golfCourses = [] } = useGolfCourses()
  const { data: userProfiles = [] } = useUserProfiles()
  
  // Fetch total downloads from file access logs
  const { data: totalDownloads = 0 } = useQuery({
    queryKey: ['total-downloads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('file_access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('access_type', 'download')
      
      if (error) throw error
      return data?.length || 0
    }
  })

  // Fetch content files stats by category
  const { data: contentStats = [] } = useQuery({
    queryKey: ['content-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_files')
        .select('file_category, download_count, file_size')
        .eq('status', 'published')
      
      if (error) throw error
      
      const statsMap = new Map()
      
      data?.forEach(file => {
        const category = file.file_category || 'unknown'
        if (!statsMap.has(category)) {
          statsMap.set(category, {
            category: category.replace('_', ' ').toUpperCase(),
            downloads: 0,
            fileCount: 0,
            totalSize: 0
          })
        }
        
        const stats = statsMap.get(category)
        stats.downloads += file.download_count || 0
        stats.fileCount += 1
        stats.totalSize += file.file_size || 0
      })
      
      return Array.from(statsMap.values())
    }
  })

  // Calculate real overview stats
  const activeUsers = userProfiles.filter(user => user.approved && !user.access_suspended).length
  const totalFiles = contentStats.reduce((sum, stat) => sum + stat.fileCount, 0)
  const totalDownloadsFromFiles = contentStats.reduce((sum, stat) => sum + stat.downloads, 0)

  // Golf course activity with real data
  const golfCourseActivity = golfCourses.map(course => {
    const courseUsers = userProfiles.filter(user => user.golf_course_id === course.id)
    const courseFileStats = contentStats.find(stat => stat.golfCourseId === course.id)
    
    return {
      name: course.name,
      users: courseUsers.length,
      activeUsers: courseUsers.filter(user => user.approved && !user.access_suspended).length,
      files: courseFileStats?.fileCount || 0,
      downloads: courseFileStats?.downloads || 0,
      location: course.location || 'Not specified'
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Platform usage statistics and performance metrics</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Golf Courses</p>
                <p className="text-2xl font-bold text-primary-teal">
                  {golfCourses.length}
                </p>
                <p className="text-xs text-muted-foreground">Total registered</p>
              </div>
              <BarChart3 className="h-8 w-8 text-primary-teal/60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold text-success-green">
                  {activeUsers}
                </p>
                <p className="text-xs text-muted-foreground">Approved & active</p>
              </div>
              <Activity className="h-8 w-8 text-success-green/60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Files</p>
                <p className="text-2xl font-bold text-accent-teal">
                  {totalFiles}
                </p>
                <p className="text-xs text-muted-foreground">Published content</p>
              </div>
              <FileText className="h-8 w-8 text-accent-teal/60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Downloads</p>
                <p className="text-2xl font-bold text-warning-amber">
                  {totalDownloadsFromFiles}
                </p>
                <p className="text-xs text-muted-foreground">Total file downloads</p>
              </div>
              <Download className="h-8 w-8 text-warning-amber/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Golf Course Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Golf Course Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {golfCourseActivity.map((course, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{course.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {course.location}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Users: </span>
                      <span className="font-medium">{course.users}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Active Users: </span>
                      <span className="font-medium">{course.activeUsers}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Files: </span>
                      <span className="font-medium">{course.files}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Downloads: </span>
                      <span className="font-medium">{course.downloads}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Content Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {contentStats.map((content, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-background/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-primary-teal" />
                    <div>
                      <p className="font-medium">{content.category}</p>
                      <p className="text-xs text-muted-foreground">
                        {content.fileCount} files
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      <span className="font-semibold">{content.downloads}</span> downloads
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(content.totalSize / (1024 * 1024 * 1024)).toFixed(1)} GB
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* User Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {golfCourses.map((course, index) => {
                const courseUsers = userProfiles.filter(user => user.golf_course_id === course.id)
                const activeUsers = courseUsers.filter(user => user.approved && !user.access_suspended).length
                const maxUsers = course.max_users || 5
                const usagePercent = (courseUsers.length / maxUsers) * 100
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{course.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {courseUsers.length} / {maxUsers} users
                      </p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          usagePercent > 80 ? 'bg-destructive' : 
                          usagePercent > 60 ? 'bg-warning-amber' : 'bg-success-green'
                        }`}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activeUsers} active users
                    </p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}