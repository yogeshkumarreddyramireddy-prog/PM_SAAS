import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Settings, Save, RefreshCw, Shield, Database, Mail, Bell } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export const AdminSettings = () => {
  const [settings, setSettings] = useState({
    systemName: "PhytoMaps Platform",
    systemEmail: "admin@phytomaps.com",
    maxFileSize: "50000",
    sessionTimeout: "60",
    emailNotifications: true,
    autoBackup: true,
    publicRegistration: false,
    adminApprovalRequired: true,
    maintenanceMode: false
  })
  
  const { toast } = useToast()

  const handleSaveSettings = () => {
    toast({
      title: "Settings Saved",
      description: "System settings have been updated successfully.",
    })
  }

  const handleBackupNow = () => {
    toast({
      title: "Backup Started",
      description: "System backup is running in the background.",
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
        <p className="text-muted-foreground">Configure platform settings and preferences</p>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-success-green/10 rounded-lg">
              <div className="text-2xl font-bold text-success-green">99.9%</div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
            <div className="text-center p-4 bg-primary-teal/10 rounded-lg">
              <div className="text-2xl font-bold text-primary-teal">28</div>
              <div className="text-sm text-muted-foreground">Active Users</div>
            </div>
            <div className="text-center p-4 bg-accent-teal/10 rounded-lg">
              <div className="text-2xl font-bold text-accent-teal">2.4GB</div>
              <div className="text-sm text-muted-foreground">Storage Used</div>
            </div>
            <div className="text-center p-4 bg-warning-amber/10 rounded-lg">
              <div className="text-2xl font-bold text-warning-amber">12h</div>
              <div className="text-sm text-muted-foreground">Last Backup</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="systemName">System Name</Label>
              <Input
                id="systemName"
                value={settings.systemName}
                onChange={(e) => setSettings(prev => ({ ...prev, systemName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemEmail">System Email</Label>
              <Input
                id="systemEmail"
                type="email"
                value={settings.systemEmail}
                onChange={(e) => setSettings(prev => ({ ...prev, systemEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxFileSize">Max File Size (MB)</Label>
              <Input
                id="maxFileSize"
                type="number"
                value={settings.maxFileSize}
                onChange={(e) => setSettings(prev => ({ ...prev, maxFileSize: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
              <Input
                id="sessionTimeout"
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security & Access Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security & Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
            <div className="space-y-1">
              <p className="font-medium">Public Registration</p>
              <p className="text-sm text-muted-foreground">Allow users to register without invitation</p>
            </div>
            <Switch
              checked={settings.publicRegistration}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, publicRegistration: checked }))}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
            <div className="space-y-1">
              <p className="font-medium">Admin Approval Required</p>
              <p className="text-sm text-muted-foreground">New users need admin approval to access the system</p>
            </div>
            <Switch
              checked={settings.adminApprovalRequired}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, adminApprovalRequired: checked }))}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-warning-amber/10 rounded-lg border border-warning-amber/20">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Maintenance Mode</p>
                {settings.maintenanceMode && <Badge variant="destructive">Active</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">Disable user access for maintenance</p>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, maintenanceMode: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications & Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
              <div className="space-y-1">
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Send email alerts for system events</p>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, emailNotifications: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Backup & Recovery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
              <div className="space-y-1">
                <p className="font-medium">Auto Backup</p>
                <p className="text-sm text-muted-foreground">Automatic daily backups</p>
              </div>
              <Switch
                checked={settings.autoBackup}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoBackup: checked }))}
              />
            </div>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleBackupNow}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Backup Now
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Save Settings */}
      <div className="flex justify-end">
        <Button 
          variant="teal" 
          onClick={handleSaveSettings}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          Save All Settings
        </Button>
      </div>
    </div>
  )
}