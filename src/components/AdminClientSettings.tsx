
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Save, Trash2, Users, Settings } from "lucide-react"
import { useUserProfiles } from "@/hooks/useSupabaseQuery"
import { useToast } from "@/hooks/use-toast"

interface AdminClientSettingsProps {
  client: {
    id: number
    name: string
    location: string | null
    max_users?: number
    signup_enabled?: boolean
  }
  onBack: () => void
}

export const AdminClientSettings = ({ client, onBack }: AdminClientSettingsProps) => {
  const [maxUsers, setMaxUsers] = useState(client.max_users || 5)
  const [signupEnabled, setSignupEnabled] = useState(client.signup_enabled ?? true)
  const [isEditing, setIsEditing] = useState(false)
  
  const { data: userProfiles = [] } = useUserProfiles()
  const { toast } = useToast()

  const clientUsers = userProfiles.filter(user => user.golf_course_id === client.id)
  const activeUsers = clientUsers.filter(user => user.approved)
  const pendingUsers = clientUsers.filter(user => !user.approved)

  const handleSave = async () => {
    // In a real implementation, you would update the golf course settings here
    toast({
      title: "Settings Updated",
      description: "Client settings have been updated successfully.",
    })
    setIsEditing(false)
  }

  const handleDeleteClient = () => {
    if (window.confirm(`Are you sure you want to delete ${client.name}? This action cannot be undone.`)) {
      // In a real implementation, you would delete the client here
      toast({
        title: "Client Deleted",
        description: "Client has been removed from the system.",
        variant: "destructive"
      })
      onBack()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{client.name}</h1>
          <p className="text-muted-foreground">Client Settings - {client.location}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Client Configuration
                </CardTitle>
                <Button 
                  variant={isEditing ? "teal" : "outline"} 
                  size="sm"
                  onClick={isEditing ? handleSave : () => setIsEditing(true)}
                >
                  {isEditing ? (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  ) : (
                    "Edit Settings"
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxUsers">Maximum Users</Label>
                  <Input
                    id="maxUsers"
                    type="number"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(parseInt(e.target.value))}
                    disabled={!isEditing}
                    min="1"
                    max="100"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="signupEnabled"
                    checked={signupEnabled}
                    onCheckedChange={setSignupEnabled}
                    disabled={!isEditing}
                  />
                  <Label htmlFor="signupEnabled">Allow New Signups</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Client</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently remove this client and all associated data
                  </p>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteClient}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Client
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center p-4 bg-success-green/10 rounded-lg">
                <p className="text-2xl font-bold text-success-green">{activeUsers.length}</p>
                <p className="text-sm text-muted-foreground">Active Users</p>
              </div>
              
              {pendingUsers.length > 0 && (
                <div className="text-center p-4 bg-warning-amber/10 rounded-lg">
                  <p className="text-2xl font-bold text-warning-amber">{pendingUsers.length}</p>
                  <p className="text-sm text-muted-foreground">Pending Approval</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Capacity Used</span>
                  <span>{activeUsers.length}/{maxUsers}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary-teal h-2 rounded-full transition-all"
                    style={{ width: `${(activeUsers.length / maxUsers) * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Users */}
          {clientUsers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {clientUsers.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{user.full_name || user.email}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="text-right">
                        <div className={`w-2 h-2 rounded-full ${user.approved ? 'bg-success-green' : 'bg-warning-amber'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
