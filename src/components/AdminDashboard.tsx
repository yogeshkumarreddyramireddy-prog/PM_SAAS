import { useState } from "react"
import { AdminHeader } from "@/components/AdminHeader"
import { AdminSidebar } from "@/components/AdminSidebar"
import { AdminClientManagement } from "@/components/AdminClientManagement"
import { AdminUserManagement } from "@/components/AdminUserManagement"
import { AdminContentManagement } from "@/components/AdminContentManagement"
import { AdminAnalytics } from "@/components/AdminAnalytics"
import { AdminSettings } from "@/components/AdminSettings"
import { AdminStatsCards } from "@/components/AdminStatsCards"
import { useAccessRequests } from "@/hooks/useSupabaseQuery"
import { useIsMobile } from "@/hooks/use-mobile"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"

interface AdminDashboardProps {
  onLogout: () => void
}

export const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState('clients')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { data: accessRequests = [] } = useAccessRequests()
  const pendingApprovals = accessRequests.filter(req => req.status === 'pending').length
  const isMobile = useIsMobile()

  const renderContent = () => {
    switch (activeTab) {
      case 'clients':
        return <AdminClientManagement />
      case 'users':
        return <AdminUserManagement />
      case 'content':
        return <AdminContentManagement />
      case 'analytics':
        return <AdminAnalytics />
      case 'settings':
        return <AdminSettings />
      default:
        return <AdminClientManagement />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Mobile Header with Menu */}
      <div className="flex items-center justify-between px-4 py-3 lg:hidden bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-50">
        <h1 className="text-lg font-semibold text-foreground">Admin</h1>
        <Drawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="sm" className="touch-target-md">
              <Menu className="h-5 w-5" />
              <span className="ml-2 text-sm">Menu</span>
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh]">
            <div className="p-4 overflow-y-auto">
              <AdminSidebar 
                activeTab={activeTab}
                onTabChange={(tab) => {
                  setActiveTab(tab)
                  setMobileMenuOpen(false)
                }}
                pendingApprovals={pendingApprovals}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <AdminHeader 
        userName="Admin User"
        onLogout={onLogout}
        pendingApprovals={pendingApprovals}
      />
      
      <div className="flex min-h-[calc(100vh-160px)]">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <AdminSidebar 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            pendingApprovals={pendingApprovals}
          />
        </div>
        
        <main className="flex-1 p-3 sm:p-4 lg:p-6 max-w-full overflow-x-hidden">
          <div className="space-y-4 sm:space-y-6 max-w-full">
            <AdminStatsCards />
            <div className="w-full overflow-x-auto">
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}