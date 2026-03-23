import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Users, Clock, Ban, CheckCircle, XCircle, Building2, 
  Search, UserPlus, AlertTriangle, RefreshCw, Mail
} from "lucide-react"
import { useUserProfiles, useUserApproval, useApproveUser } from "@/hooks/useSupabaseQuery"
import { UserSuspensionDialog } from "@/components/admin/UserSuspensionDialog"
import { UserManageDialog } from "@/components/admin/UserManageDialog"
import { AccessRequestsTab } from "@/components/admin/AccessRequestsTab"

const getUserCourses = (user: any): string => {
  if (user.client_golf_courses?.length > 0) {
    return user.client_golf_courses.map((c: any) => c.active_golf_courses?.name).filter(Boolean).join(", ")
  }
  return user.active_golf_courses?.name || "No course assigned"
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const StatusBadge = ({ user }: { user: any }) => {
  if (user.access_suspended) return <Badge variant="destructive" className="text-xs">Suspended</Badge>
  if (!user.approved) return <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">Pending</Badge>
  return <Badge className="bg-emerald-500 text-white text-xs">Active</Badge>
}

const UserRow = ({ user, onApprove, onReject, approving }: {
  user: any
  onApprove?: () => void
  onReject?: () => void
  approving?: boolean
}) => (
  <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
    <td className="px-4 py-3">
      <div>
        <p className="font-medium text-sm">{user.full_name || "—"}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3" />{user.email}
        </p>
      </div>
    </td>
    <td className="px-4 py-3 hidden md:table-cell">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[160px]">{getUserCourses(user)}</span>
      </div>
    </td>
    <td className="px-4 py-3 hidden lg:table-cell">
      <p className="text-xs text-muted-foreground">{formatDate(user.created_at)}</p>
    </td>
    <td className="px-4 py-3">
      <StatusBadge user={user} />
    </td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-1.5 justify-end">
        {onApprove && (
          <Button variant="teal" size="sm" onClick={onApprove} disabled={approving} className="h-7 px-2.5 text-xs">
            <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
          </Button>
        )}
        {onReject && (
          <Button variant="outline" size="sm" onClick={onReject} className="h-7 px-2.5 text-xs">
            <XCircle className="h-3.5 w-3.5 mr-1" />Reject
          </Button>
        )}
        {!onApprove && (
          <>
            <UserSuspensionDialog
              userId={user.id}
              userName={user.full_name || user.email}
              isCurrentlySuspended={!!user.access_suspended}
            >
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                {user.access_suspended ? (
                  <><AlertTriangle className="h-3.5 w-3.5 mr-1 text-emerald-500" />Restore</>
                ) : (
                  <><Ban className="h-3.5 w-3.5 mr-1" />Suspend</>
                )}
              </Button>
            </UserSuspensionDialog>
            <UserManageDialog
              userId={user.id}
              userName={user.full_name || user.email}
              currentRole={user.role || 'client'}
              assignedCourseIds={user.client_golf_courses ? user.client_golf_courses.map((c: any) => c.active_golf_courses?.id).filter(Boolean) : []}
            >
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">Manage</Button>
            </UserManageDialog>
          </>
        )}
      </div>
    </td>
  </tr>
)

const UserTable = ({ users, children, emptyIcon, emptyText }: {
  users: any[]
  children: (user: any) => React.ReactNode
  emptyIcon: React.ReactNode
  emptyText: string
}) => (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b bg-muted/40">
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Golf Course</th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Joined</th>
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
          <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map(children)}
      </tbody>
    </table>
    {users.length === 0 && (
      <div className="py-12 text-center text-muted-foreground">
        <div className="flex justify-center mb-3 opacity-30">{emptyIcon}</div>
        <p>{emptyText}</p>
      </div>
    )}
  </div>
)

export const AdminUserManagement = () => {
  const [search, setSearch] = useState("")
  const { data: userProfiles = [], isLoading, refetch } = useUserProfiles()
  const userApprovalMutation = useUserApproval()
  const approveUserMutation = useApproveUser()

  const filterBySearch = (users: any[]) =>
    search.trim()
      ? users.filter(u =>
          u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          u.email?.toLowerCase().includes(search.toLowerCase()) ||
          getUserCourses(u).toLowerCase().includes(search.toLowerCase())
        )
      : users

  const activeUsers = filterBySearch(userProfiles.filter(u => u.approved && !u.access_suspended))
  const pendingUsers = filterBySearch(userProfiles.filter(u => !u.approved && !u.access_suspended))
  const suspendedUsers = filterBySearch(userProfiles.filter(u => u.access_suspended))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{userProfiles.length} total users across all golf courses</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search users, courses..." 
              className="pl-9 h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-9 px-2.5" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <Users className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-lg font-bold">{userProfiles.filter(u => u.approved && !u.access_suspended).length}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold">{userProfiles.filter(u => !u.approved && !u.access_suspended).length}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
            <Ban className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Suspended</p>
            <p className="text-lg font-bold">{userProfiles.filter(u => u.access_suspended).length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="active" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Active <span className="text-xs opacity-60">({activeUsers.length})</span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending <span className="text-xs opacity-60">({pendingUsers.length})</span>
          </TabsTrigger>
          <TabsTrigger value="suspended" className="gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Suspended <span className="text-xs opacity-60">({suspendedUsers.length})</span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base">Active Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <UserTable 
                users={activeUsers} 
                emptyIcon={<Users className="h-10 w-10" />}
                emptyText={search ? "No users match your search" : "No active users"}
              >
                {(user) => (
                  <UserRow key={user.id} user={user} />
                )}
              </UserTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between">
              <CardTitle className="text-base">Pending Approval</CardTitle>
              {pendingUsers.length > 0 && (
                <Button
                  variant="teal"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => pendingUsers.forEach(u => approveUserMutation.mutate(u.id))}
                  disabled={approveUserMutation.isPending}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Approve All ({pendingUsers.length})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <UserTable 
                users={pendingUsers} 
                emptyIcon={<Clock className="h-10 w-10" />}
                emptyText={search ? "No pending users match your search" : "No pending approvals"}
              >
                {(user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onApprove={() => approveUserMutation.mutate(user.id)}
                    onReject={() => userApprovalMutation.mutate({ userId: user.id, approved: false })}
                    approving={approveUserMutation.isPending}
                  />
                )}
              </UserTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspended" className="mt-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base">Suspended Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <UserTable 
                users={suspendedUsers} 
                emptyIcon={<Ban className="h-10 w-10" />}
                emptyText={search ? "No suspended users match your search" : "No suspended users"}
              >
                {(user) => <UserRow key={user.id} user={user} />}
              </UserTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <AccessRequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
