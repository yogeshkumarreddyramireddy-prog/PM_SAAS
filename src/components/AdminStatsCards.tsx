import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Users, FileText, UserCheck, AlertCircle } from "lucide-react"
import { useGolfCourses, useUserProfiles, useAccessRequests } from "@/hooks/useSupabaseQuery"
import { supabase } from "@/integrations/supabase/client"
import { useQuery } from "@tanstack/react-query"

export const AdminStatsCards = () => {
  const { data: golfCourses = [] } = useGolfCourses()
  const { data: userProfiles = [] } = useUserProfiles()
  const { data: accessRequests = [] } = useAccessRequests()

  // Fetch total content files across all golf courses
  const { data: allContentFiles = [] } = useQuery({
    queryKey: ['all-content-files'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_files')
        .select('id, status, golf_course_id')
      
      if (error) throw error
      return data
    }
  })

  const pendingRequests = accessRequests.filter(req => req.status === 'pending')
  const publishedFiles = allContentFiles.filter(file => file.status === 'published')
  const activeUsers = userProfiles.filter(user => user.approved && !user.access_suspended)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
      <Card className="hover:scale-[1.02] transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium">Total Clients</CardTitle>
          <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary-teal flex-shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary-teal">{golfCourses.length}</div>
          <p className="text-xs text-muted-foreground">Active golf courses</p>
        </CardContent>
      </Card>

      <Card className="hover:scale-[1.02] transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium">Active Users</CardTitle>
          <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-success-green flex-shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-success-green">{activeUsers.length}</div>
          <p className="text-xs text-muted-foreground">
            {userProfiles.length} total users
          </p>
        </CardContent>
      </Card>

      <Card className="hover:scale-[1.02] transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium">Pending Requests</CardTitle>
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-warning-amber flex-shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-warning-amber">{pendingRequests.length}</div>
          <div className="text-xs text-muted-foreground">
            {pendingRequests.length > 0 && (
              <Badge variant="outline" className="text-warning-amber border-warning-amber text-xs">
                Needs attention
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="hover:scale-[1.02] transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium">Published Files</CardTitle>
          <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary-teal flex-shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary-teal">{publishedFiles.length}</div>
          <p className="text-xs text-muted-foreground">
            {allContentFiles.length} total files
          </p>
        </CardContent>
      </Card>
    </div>
  )
}