import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react"
import { useAccessRequests, useAccessRequestApproval } from "@/hooks/useSupabaseQuery"

export const AccessRequestsTab = () => {
  const { data: accessRequests = [], isLoading } = useAccessRequests()
  const approvalMutation = useAccessRequestApproval()

  const pendingRequests = accessRequests.filter(request => request.status === 'pending')

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleApproval = (requestId: string, userId: string, status: 'approved' | 'rejected') => {
    approvalMutation.mutate({ requestId, status, userId })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading access requests...</p>
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-warning-amber" />
          Pending Access Requests ({pendingRequests.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Review and approve user access restoration requests
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pendingRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-start justify-between p-4 border rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold">
                    {request.user_profiles?.full_name || request.user_profiles?.email}
                  </h3>
                  <Badge variant="outline" className="text-warning-amber border-warning-amber">
                    {request.request_type === 'restore_access' ? 'Access Restoration' : 'Initial Access'}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground mb-2">
                  {request.user_profiles?.email}
                </p>
                
                {request.user_profiles?.active_golf_courses && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Golf Course: {request.user_profiles.active_golf_courses.name}
                  </p>
                )}
                
                {request.message && (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-muted rounded">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Request Message:</p>
                      <p className="text-sm">{request.message}</p>
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">
                  Requested: {formatDate(request.created_at)}
                </p>
              </div>
              
              <div className="flex gap-2 ml-4">
                <Button 
                  variant="teal" 
                  size="sm"
                  onClick={() => handleApproval(request.id, request.user_profiles?.id || '', 'approved')}
                  disabled={approvalMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleApproval(request.id, request.user_profiles?.id || '', 'rejected')}
                  disabled={approvalMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
          
          {pendingRequests.length === 0 && (
            <div className="text-center p-8">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No pending access requests</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
