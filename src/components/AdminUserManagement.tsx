import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Clock, CheckCircle, XCircle, Mail, Building2, Ban, AlertTriangle } from "lucide-react"
import { useUserProfiles, useUserApproval } from "@/hooks/useSupabaseQuery"
import { AccessRequestsTab } from "@/components/admin/AccessRequestsTab"
import { UserSuspensionDialog } from "@/components/admin/UserSuspensionDialog"
import { UserManageDialog } from "@/components/admin/UserManageDialog"

export const AdminUserManagement = () => {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  
  const { data: userProfiles = [], isLoading } = useUserProfiles()
  const userApprovalMutation = useUserApproval()

  const activeUsers = userProfiles.filter(user => user.approved && !user.access_suspended)
  const pendingUsers = userProfiles.filter(user => !user.approved)
  const suspendedUsers = userProfiles.filter(user => user.access_suspended)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleUserSelect = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleBulkApprove = () => {
    selectedUsers.forEach(userId => {
      userApprovalMutation.mutate({ userId, approved: true })
    })
    setSelectedUsers([])
  }

  const handleBulkReject = () => {
    selectedUsers.forEach(userId => {
      userApprovalMutation.mutate({ userId, approved: false })
    })
    setSelectedUsers([])
  }

  const handleApproveUser = (userId: string) => {
    userApprovalMutation.mutate({ userId, approved: true })
  }

  const handleRejectUser = (userId: string) => {
    userApprovalMutation.mutate({ userId, approved: false })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage user access and permissions</p>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active">Active Users ({activeUsers.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending Approval ({pendingUsers.length})</TabsTrigger>
          <TabsTrigger value="suspended">Suspended ({suspendedUsers.length})</TabsTrigger>
          <TabsTrigger value="requests">Access Requests</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary-teal" />
                Active Users by Golf Course
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{user.full_name || user.email}</h3>
                        <Badge variant="default" className="bg-success-green">Active</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {user.active_golf_courses?.name || 'No golf course assigned'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm font-medium">Role: {user.role}</p>
                      <p className="text-sm text-muted-foreground">
                        Joined: {formatDate(user.created_at)}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <UserSuspensionDialog
                        userId={user.id}
                        userName={user.full_name || user.email}
                        isCurrentlySuspended={false}
                      >
                        <Button variant="outline" size="sm">
                          <Ban className="h-4 w-4 mr-1" />
                          Suspend
                        </Button>
                      </UserSuspensionDialog>
                      <UserManageDialog
                        userId={user.id}
                        userName={user.full_name || user.email}
                        currentRole={user.role || 'client'}
                      >
                        <Button variant="outline" size="sm">
                          Manage
                        </Button>
                      </UserManageDialog>
                    </div>
                  </div>
                ))}
                
                {activeUsers.length === 0 && (
                  <div className="text-center p-8">
                    <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No active users found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning-amber" />
                  Pending Approval Requests
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Review and approve new user access requests
                </p>
              </div>
              {selectedUsers.length > 0 && (
                <div className="flex gap-2">
                  <Button 
                    variant="teal" 
                    size="sm" 
                    onClick={handleBulkApprove}
                    disabled={userApprovalMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Selected ({selectedUsers.length})
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleBulkReject}
                    disabled={userApprovalMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Selected
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserSelect(user.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold">{user.full_name || user.email}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {user.active_golf_courses?.name || 'No golf course assigned'}
                          </p>
                        </div>
                        {user.request_reason && (
                          <p className="text-sm mt-2 p-2 bg-muted rounded">
                            <strong>Reason:</strong> {user.request_reason}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground mb-2">
                        Requested: {formatDate(user.requested_at || user.created_at)}
                      </p>
                      <div className="flex gap-2">
                        <Button 
                          variant="teal" 
                          size="sm"
                          onClick={() => handleApproveUser(user.id)}
                          disabled={userApprovalMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleRejectUser(user.id)}
                          disabled={userApprovalMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button variant="outline" size="sm">
                          <Mail className="h-4 w-4 mr-1" />
                          Contact
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {pendingUsers.length === 0 && (
                  <div className="text-center p-8">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No pending approval requests</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="suspended" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-destructive" />
                Suspended Users
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Users with temporarily suspended access
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {suspendedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{user.full_name || user.email}</h3>
                        <Badge variant="destructive">Suspended</Badge>
                        {user.access_request_pending && (
                          <Badge variant="outline" className="text-warning-amber border-warning-amber">
                            Request Pending
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-1">{user.email}</p>
                      
                      {user.active_golf_courses && (
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {user.active_golf_courses.name}
                          </p>
                        </div>
                      )}
                      
                      {user.suspension_reason && (
                        <div className="mt-2 p-2 bg-muted rounded">
                          <p className="text-sm font-medium">Suspension Reason:</p>
                          <p className="text-sm">{user.suspension_reason}</p>
                        </div>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        Suspended: {user.suspended_at ? formatDate(user.suspended_at) : 'Unknown'}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <UserSuspensionDialog
                        userId={user.id}
                        userName={user.full_name || user.email}
                        isCurrentlySuspended={true}
                      >
                        <Button variant="teal" size="sm">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          Restore Access
                        </Button>
                      </UserSuspensionDialog>
                    </div>
                  </div>
                ))}
                
                {suspendedUsers.length === 0 && (
                  <div className="text-center p-8">
                    <Ban className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No suspended users</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="requests" className="mt-6">
          <AccessRequestsTab />
        </TabsContent>
        
        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>User Activity Logs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monitor user login activity and access patterns
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {userProfiles.slice(0, 10).map((user, index) => (
                  <div key={user.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">
                        {user.approved ? 'User approved' : 'User registered'}: {user.full_name || user.email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.active_golf_courses?.name || 'No golf course assigned'}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(user.updated_at || user.created_at)}
                    </p>
                  </div>
                ))}
                
                {userProfiles.length === 0 && (
                  <div className="text-center p-8">
                    <p className="text-muted-foreground">No activity logs available</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
