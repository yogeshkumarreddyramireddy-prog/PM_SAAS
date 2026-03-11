import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bell, Mail, Send, Settings, User, CheckCircle } from "lucide-react"

// Mock notification data
const mockNotifications = [
  {
    id: 1,
    type: 'new_signup',
    message: 'Mike Wilson requested access to Pebble Beach Golf Links',
    timestamp: '2024-01-16T09:00:00Z',
    read: false
  },
  {
    id: 2,
    type: 'new_signup',
    message: 'Lisa Chen requested access to St. Andrews Links',
    timestamp: '2024-01-15T14:30:00Z',
    read: false
  },
  {
    id: 3,
    type: 'user_approved',
    message: 'John Smith was approved for Augusta National Golf Club',
    timestamp: '2024-01-15T10:00:00Z',
    read: true
  }
]

const emailTemplates = {
  approval: {
    subject: 'Access Approved - PMV Platform',
    body: `Dear [USER_NAME],

Your access request for [GOLF_COURSE] has been approved!

You can now log in to the PMV Client Portal to access your course mapping data, reports, and analysis tools.

Login here: [LOGIN_URL]

If you have any questions, please contact our support team.

Best regards,
PMV Platform Team`
  },
  rejection: {
    subject: 'Access Request Update - PMV Platform',
    body: `Dear [USER_NAME],

Thank you for your interest in accessing [GOLF_COURSE] data through the PMV Platform.

Unfortunately, we cannot approve your access request at this time due to: [REASON]

If you believe this is an error or have additional information to support your request, please contact our support team.

Best regards,
PMV Platform Team`
  }
}

export const AdminNotifications = () => {
  const [notifications, setNotifications] = useState(mockNotifications)
  const [templates, setTemplates] = useState(emailTemplates)
  const [activeTemplate, setActiveTemplate] = useState<'approval' | 'rejection'>('approval')

  const markAsRead = (notificationId: number) => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification
      )
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(notification => ({ ...notification, read: true }))
    )
  }

  const updateTemplate = (type: 'approval' | 'rejection', field: 'subject' | 'body', value: string) => {
    setTemplates(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value
      }
    }))
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-6">
      <Tabs defaultValue="notifications" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="notifications">
            Notifications {unreadCount > 0 && <Badge variant="destructive" className="ml-2">{unreadCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="templates">Email Templates</TabsTrigger>
        </TabsList>
        
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary-teal" />
                  System Notifications
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  New user signups and platform activity
                </p>
              </div>
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark All Read
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start justify-between p-4 border rounded-lg cursor-pointer transition-smooth ${
                      !notification.read ? 'bg-primary-teal/5 border-primary-teal/20' : 'hover:shadow-card'
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${
                        notification.type === 'new_signup' ? 'bg-warning-amber/10' : 'bg-primary-teal/10'
                      }`}>
                        {notification.type === 'new_signup' ? (
                          <User className="h-4 w-4 text-warning-amber" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-primary-teal" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`${!notification.read ? 'font-medium' : ''}`}>
                          {notification.message}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(notification.timestamp)}
                        </p>
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-primary-teal rounded-full mt-2"></div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="templates" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary-teal" />
                  Email Templates
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Customize automated email templates sent to users
                </p>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTemplate} onValueChange={(value) => setActiveTemplate(value as 'approval' | 'rejection')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="approval">Approval Email</TabsTrigger>
                    <TabsTrigger value="rejection">Rejection Email</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="approval" className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="approval-subject">Email Subject</Label>
                      <Input
                        id="approval-subject"
                        value={templates.approval.subject}
                        onChange={(e) => updateTemplate('approval', 'subject', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="approval-body">Email Body</Label>
                      <Textarea
                        id="approval-body"
                        rows={12}
                        value={templates.approval.body}
                        onChange={(e) => updateTemplate('approval', 'body', e.target.value)}
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="rejection" className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="rejection-subject">Email Subject</Label>
                      <Input
                        id="rejection-subject"
                        value={templates.rejection.subject}
                        onChange={(e) => updateTemplate('rejection', 'subject', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rejection-body">Email Body</Label>
                      <Textarea
                        id="rejection-body"
                        rows={12}
                        value={templates.rejection.body}
                        onChange={(e) => updateTemplate('rejection', 'body', e.target.value)}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium mb-2">Available Variables</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><code>[USER_NAME]</code> - Recipient's name</p>
                        <p><code>[GOLF_COURSE]</code> - Golf course name</p>
                        <p><code>[LOGIN_URL]</code> - Client portal login URL</p>
                        <p><code>[REASON]</code> - Rejection reason (rejection emails only)</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline">
                        <Send className="h-4 w-4 mr-2" />
                        Send Test Email
                      </Button>
                      <Button variant="teal">
                        <Settings className="h-4 w-4 mr-2" />
                        Save Templates
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}