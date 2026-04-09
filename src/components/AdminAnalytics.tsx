import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart3, Users, Activity, Download, LogIn, Eye, FileText, Clock, RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGolfCourses, useUserProfiles } from "@/hooks/useSupabaseQuery"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { formatDistanceToNow, format } from "date-fns"

// ─── helpers ─────────────────────────────────────────────────────────────────

const parseUA = (ua: string | null): string => {
  if (!ua) return "Unknown"
  if (/mobile/i.test(ua)) return "Mobile"
  if (/chrome/i.test(ua)) return "Chrome"
  if (/firefox/i.test(ua)) return "Firefox"
  if (/safari/i.test(ua)) return "Safari"
  if (/edge/i.test(ua)) return "Edge"
  return "Desktop"
}

const accessTypeBadge = (type: string) => {
  if (type === "download") return <Badge className="bg-warning-amber/20 text-warning-amber border-warning-amber/30 text-xs">Download</Badge>
  if (type === "preview") return <Badge className="bg-accent-teal/20 text-accent-teal border-accent-teal/30 text-xs">Preview</Badge>
  return <Badge variant="secondary" className="text-xs">{type}</Badge>
}

// ─── queries ─────────────────────────────────────────────────────────────────

const useLoginLogs = () =>
  useQuery({
    queryKey: ["login-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_login_logs")
        .select("*")
        .order("logged_in_at", { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 60_000,
  })

const useFileAccessLogs = () =>
  useQuery({
    queryKey: ["file-access-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("file_access_logs")
        .select(`
          id, access_type, accessed_at, user_agent, metadata,
          user_id,
          content_files (filename, file_category, golf_course_id),
          user_profiles (full_name, email)
        `)
        .order("accessed_at", { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 60_000,
  })

const useContentStats = () =>
  useQuery({
    queryKey: ["content-stats-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_files")
        .select("file_category, download_count, file_size, golf_course_id")
        .eq("status", "published")
      if (error) throw error

      const map = new Map<string, { category: string; downloads: number; fileCount: number; totalSize: number }>()
      data?.forEach(f => {
        const cat = f.file_category || "unknown"
        if (!map.has(cat)) map.set(cat, { category: cat.replace("_", " ").toUpperCase(), downloads: 0, fileCount: 0, totalSize: 0 })
        const s = map.get(cat)!
        s.downloads += f.download_count ?? 0
        s.fileCount += 1
        s.totalSize += f.file_size ?? 0
      })
      return Array.from(map.values())
    },
  })

// ─── sub-components ───────────────────────────────────────────────────────────

const EmptyState = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
    <Icon className="h-10 w-10 opacity-30" />
    <p className="text-sm">{label}</p>
  </div>
)

const LoadingRows = () => (
  <div className="space-y-3 py-4">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="h-12 bg-muted/40 rounded-lg animate-pulse" />
    ))}
  </div>
)

// ─── Login Logs Tab ───────────────────────────────────────────────────────────

const LoginLogsTab = () => {
  const { data: logs = [], isLoading, refetch, isFetching } = useLoginLogs()
  const { data: userProfiles = [] } = useUserProfiles()

  const getUserName = (userId: string | null) => {
    if (!userId) return "Unknown"
    const p = userProfiles.find(u => u.id === userId)
    return p?.full_name || p?.email || userId.slice(0, 8) + "…"
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{logs.length} login events (last 200)</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? <LoadingRows /> : logs.length === 0 ? (
        <EmptyState icon={LogIn} label="No login events recorded yet. Logins will appear here after the next sign-in." />
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div
              key={log.id}
              className="flex items-center justify-between p-3 bg-background/50 rounded-lg border hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary-teal/10 flex items-center justify-center shrink-0">
                  <LogIn className="h-4 w-4 text-primary-teal" />
                </div>
                <div>
                  <p className="font-medium text-sm">{getUserName(log.user_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.portal_type ? `${log.portal_type} portal` : ""} · {parseUA(log.user_agent)}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">
                  {format(new Date(log.logged_in_at), "dd MMM yyyy, HH:mm")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(log.logged_in_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── File Access Logs Tab ─────────────────────────────────────────────────────

const FileAccessLogsTab = () => {
  const { data: logs = [], isLoading, refetch, isFetching } = useFileAccessLogs()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{logs.length} file access events (last 200)</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? <LoadingRows /> : logs.length === 0 ? (
        <EmptyState icon={Eye} label="No file access events yet. Downloads and previews will appear here." />
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const file = log.content_files
            const user = log.user_profiles
            const userName = user?.full_name || user?.email || (log.user_id ? log.user_id.slice(0, 8) + "…" : "Unknown user")
            const fileName = file?.filename || (log.metadata as any)?.file_name || "Unknown file"
            const category = file?.file_category?.replace("_", " ") || ""
            const accessedAt = log.accessed_at ? new Date(log.accessed_at) : null

            return (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 bg-background/50 rounded-lg border hover:bg-background/80 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-success-green/10 flex items-center justify-center shrink-0">
                    {log.access_type === "download" ? (
                      <Download className="h-4 w-4 text-warning-amber" />
                    ) : (
                      <Eye className="h-4 w-4 text-success-green" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate max-w-[200px]">{fileName}</p>
                      {accessTypeBadge(log.access_type)}
                      {category && <Badge variant="outline" className="text-xs">{category}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">by {userName} · {parseUA(log.user_agent)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {accessedAt && (
                    <>
                      <p className="text-sm">{format(accessedAt, "dd MMM yyyy, HH:mm")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(accessedAt, { addSuffix: true })}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Golf Course Overview Tab ─────────────────────────────────────────────────

const CourseOverviewTab = ({ golfCourses, userProfiles }: { golfCourses: any[]; userProfiles: any[] }) => (
  <div className="space-y-3">
    {golfCourses.length === 0 ? (
      <EmptyState icon={BarChart3} label="No golf courses found." />
    ) : golfCourses.map((course, i) => {
      const courseUsers = userProfiles.filter(u => u.golf_course_id === course.id)
      const active = courseUsers.filter(u => u.approved && !u.access_suspended).length
      const maxUsers = course.max_users ?? 5
      const pct = Math.min((courseUsers.length / maxUsers) * 100, 100)

      return (
        <div key={i} className="p-4 bg-background/50 rounded-lg border">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-semibold">{course.name}</h3>
            <Badge variant="secondary" className="text-xs">{course.location || "Not specified"}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
            <div><span className="text-muted-foreground">Total Users: </span><span className="font-medium">{courseUsers.length}</span></div>
            <div><span className="text-muted-foreground">Active Users: </span><span className="font-medium text-success-green">{active}</span></div>
            <div><span className="text-muted-foreground">Max Users: </span><span className="font-medium">{maxUsers}</span></div>
            <div><span className="text-muted-foreground">Capacity: </span><span className="font-medium">{Math.round(pct)}%</span></div>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${pct > 80 ? "bg-destructive" : pct > 60 ? "bg-warning-amber" : "bg-success-green"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )
    })}
  </div>
)

// ─── Content Performance Tab ──────────────────────────────────────────────────

const ContentPerformanceTab = () => {
  const { data: contentStats = [], isLoading } = useContentStats()
  const { data: userProfiles = [] } = useUserProfiles()
  const { data: golfCourses = [] } = useGolfCourses()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Content by category */}
      <Card className="shadow-none border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Downloads by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingRows /> : contentStats.length === 0 ? (
            <EmptyState icon={FileText} label="No published files yet." />
          ) : (
            <div className="space-y-3">
              {contentStats.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-background/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{s.category}</p>
                    <p className="text-xs text-muted-foreground">{s.fileCount} files · {(s.totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-warning-amber">{s.downloads}</p>
                    <p className="text-xs text-muted-foreground">downloads</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User distribution */}
      <Card className="shadow-none border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Users per Course
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {golfCourses.map((course, i) => {
              const cu = userProfiles.filter(u => u.golf_course_id === course.id)
              const active = cu.filter(u => u.approved && !u.access_suspended).length
              const maxUsers = course.max_users ?? 5
              const pct = Math.min((cu.length / maxUsers) * 100, 100)
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium truncate">{course.name}</span>
                    <span className="text-muted-foreground shrink-0">{cu.length} / {maxUsers}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${pct > 80 ? "bg-destructive" : pct > 60 ? "bg-warning-amber" : "bg-success-green"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{active} active</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const AdminAnalytics = () => {
  const { data: golfCourses = [] } = useGolfCourses()
  const { data: userProfiles = [] } = useUserProfiles()
  const { data: loginLogs = [] } = useLoginLogs()
  const { data: fileAccessLogs = [] } = useFileAccessLogs()
  const { data: contentStats = [] } = useContentStats()

  const activeUsers = userProfiles.filter(u => u.approved && !u.access_suspended).length
  const totalFiles = contentStats.reduce((s, c) => s + c.fileCount, 0)
  const totalDownloads = contentStats.reduce((s, c) => s + c.downloads, 0)
  const downloadEvents = fileAccessLogs.filter((l: any) => l.access_type === "download").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Platform usage statistics and performance metrics</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Logins</p>
              <p className="text-2xl font-bold text-primary-teal">{loginLogs.length}</p>
              <p className="text-xs text-muted-foreground">Recorded sign-ins</p>
            </div>
            <LogIn className="h-8 w-8 text-primary-teal/50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold text-success-green">{activeUsers}</p>
              <p className="text-xs text-muted-foreground">Approved &amp; active</p>
            </div>
            <Activity className="h-8 w-8 text-success-green/50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">File Accesses</p>
              <p className="text-2xl font-bold text-accent-teal">{fileAccessLogs.length}</p>
              <p className="text-xs text-muted-foreground">{downloadEvents} downloads</p>
            </div>
            <Eye className="h-8 w-8 text-accent-teal/50" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Published Files</p>
              <p className="text-2xl font-bold text-warning-amber">{totalFiles}</p>
              <p className="text-xs text-muted-foreground">{totalDownloads} total downloads</p>
            </div>
            <Download className="h-8 w-8 text-warning-amber/50" />
          </CardContent>
        </Card>
      </div>

      {/* Tabbed logs */}
      <Tabs defaultValue="login-logs">
        <TabsList className="mb-4">
          <TabsTrigger value="login-logs" className="flex items-center gap-1.5">
            <LogIn className="h-4 w-4" /> Login Logs
            {loginLogs.length > 0 && (
              <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-primary-teal text-white">{loginLogs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="file-access" className="flex items-center gap-1.5">
            <Eye className="h-4 w-4" /> File Access
            {fileAccessLogs.length > 0 && (
              <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-success-green text-white">{fileAccessLogs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="courses" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" /> Courses
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Content
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-4">
            <TabsContent value="login-logs" className="mt-0">
              <LoginLogsTab />
            </TabsContent>
            <TabsContent value="file-access" className="mt-0">
              <FileAccessLogsTab />
            </TabsContent>
            <TabsContent value="courses" className="mt-0">
              <CourseOverviewTab golfCourses={golfCourses} userProfiles={userProfiles} />
            </TabsContent>
            <TabsContent value="content" className="mt-0">
              <ContentPerformanceTab />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  )
}