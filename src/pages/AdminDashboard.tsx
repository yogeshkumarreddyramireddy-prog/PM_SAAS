import { PMVHeader } from "@/components/PMVHeader"
import { AdminTabs } from "@/components/AdminTabs"
import { AdminStatsCards } from "@/components/AdminStatsCards"
import { useAccessRequests } from "@/hooks/useSupabaseQuery"


interface AdminDashboardProps {
  onLogout: () => void
  onClientSelect: (clientId: number) => void
  onTabChange: (tab: string) => void
  activeTab?: string
}

export const AdminDashboard = ({ onLogout, onClientSelect, onTabChange, activeTab = 'clients' }: AdminDashboardProps) => {
  const { data: accessRequests = [] } = useAccessRequests()
  const pendingApprovals = accessRequests.filter(req => req.status === 'pending').length

  return (
    <div className="min-h-screen">
      <PMVHeader
        userType="admin"
        userInfo={{ name: "Admin User", role: "Platform Administrator" }}
        onLogout={onLogout}
      />
      
      <main className="container mx-auto px-6 py-8">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Admin Dashboard
          </h1>
          <p className="text-white/80">
            Manage golf course clients and their mapping data
          </p>
        </div>

        {/* Stats Overview */}
        <AdminStatsCards />

        {/* Admin Tabs */}
        <AdminTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          onClientSelect={onClientSelect}
        />
      </main>
    </div>
  )
}