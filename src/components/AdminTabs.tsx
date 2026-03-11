import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminClientList } from "./AdminClientList"
import { AdminUserManagement } from "./AdminUserManagement"
import { AdminGolfCourseSettings } from "./AdminGolfCourseSettings"
import { AdminNotifications } from "./AdminNotifications"

interface AdminTabsProps {
  activeTab?: string
  onTabChange: (tab: string) => void
  onClientSelect: (clientId: number) => void
}

export const AdminTabs = ({ activeTab = 'clients', onTabChange, onClientSelect }: AdminTabsProps) => {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-0">
        <TabsTrigger value="clients" className="text-xs sm:text-sm">
          <span className="hidden sm:inline">Clients</span>
          <span className="sm:hidden">Clients</span>
        </TabsTrigger>
        <TabsTrigger value="users" className="text-xs sm:text-sm">
          <span className="hidden sm:inline">User Management</span>
          <span className="sm:hidden">Users</span>
        </TabsTrigger>
        <TabsTrigger value="settings" className="text-xs sm:text-sm">
          <span className="hidden sm:inline">Course Settings</span>
          <span className="sm:hidden">Settings</span>
        </TabsTrigger>
        <TabsTrigger value="notifications" className="text-xs sm:text-sm">
          <span className="hidden sm:inline">Notifications</span>
          <span className="sm:hidden">Notes</span>
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="clients" className="mt-6">
        <AdminClientList onClientSelect={onClientSelect} />
      </TabsContent>
      
      <TabsContent value="users" className="mt-6">
        <AdminUserManagement />
      </TabsContent>
      
      <TabsContent value="settings" className="mt-6">
        <AdminGolfCourseSettings />
      </TabsContent>
      
      <TabsContent value="notifications" className="mt-6">
        <AdminNotifications />
      </TabsContent>
    </Tabs>
  )
}