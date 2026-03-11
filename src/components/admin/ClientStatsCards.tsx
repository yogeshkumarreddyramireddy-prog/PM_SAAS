
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Users, Activity } from "lucide-react"

interface ClientStatsCardsProps {
  totalClients: number
  activeUsers: number
  pendingUsers: number
  totalUsers: number
}

export const ClientStatsCards = ({ 
  totalClients, 
  activeUsers, 
  pendingUsers, 
  totalUsers 
}: ClientStatsCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Clients</p>
              <p className="text-2xl font-bold text-primary-teal">{totalClients}</p>
            </div>
            <Building2 className="h-8 w-8 text-primary-teal/60" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold text-success-green">{activeUsers}</p>
            </div>
            <Users className="h-8 w-8 text-success-green/60" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pending Approvals</p>
              <p className="text-2xl font-bold text-warning-amber">{pendingUsers}</p>
            </div>
            <Users className="h-8 w-8 text-warning-amber/60" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold text-accent-teal">{totalUsers}</p>
            </div>
            <Activity className="h-8 w-8 text-accent-teal/60" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
