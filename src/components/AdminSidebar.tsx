import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Building2, Users, Settings, BarChart3, Upload, Eye } from "lucide-react"

interface AdminSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  pendingApprovals?: number
}

const sidebarItems = [
  {
    id: 'clients',
    label: 'Client Management',
    icon: Building2,
    description: 'Manage golf courses'
  },
  {
    id: 'users',
    label: 'User Management',
    icon: Users,
    description: 'Approve & manage users'
  },
  {
    id: 'content',
    label: 'Content Management',
    icon: Upload,
    description: 'Upload & organize files'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    description: 'Usage & performance'
  },
  {
    id: 'settings',
    label: 'System Settings',
    icon: Settings,
    description: 'Configure platform'
  }
]

export const AdminSidebar = ({ activeTab, onTabChange, pendingApprovals = 0 }: AdminSidebarProps) => {
  return (
    <aside className="w-full lg:w-64 bg-white/50 backdrop-blur-sm lg:border-r border-border/50 lg:min-h-[calc(100vh-80px)]">
      <div className="p-4 lg:p-6">
        <h3 className="text-base lg:text-lg font-semibold text-foreground mb-3 lg:mb-4">
          Admin Dashboard
        </h3>
        
        <nav className="space-y-1 lg:space-y-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            const showBadge = item.id === 'users' && pendingApprovals > 0
            
            return (
              <Button
                key={item.id}
                variant={isActive ? "teal" : "ghost"}
                size="sm"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "w-full justify-start h-auto p-3 flex-col items-start gap-1 touch-target-lg",
                  "lg:flex-col lg:items-start",
                  "transition-all duration-200 hover:scale-[1.02]",
                  isActive ? "shadow-card" : "hover:bg-primary-teal/5"
                )}
              >
                <div className="flex items-center gap-3 w-full">
                  <Icon className={cn(
                    "h-4 w-4 lg:h-5 lg:w-5 flex-shrink-0",
                    isActive ? "text-white" : "text-primary-teal"
                  )} />
                  <span className={cn(
                    "font-medium text-sm lg:text-base",
                    isActive ? "text-white" : "text-foreground"
                  )}>
                    {item.label}
                  </span>
                  {showBadge && (
                    <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-full min-w-[1.5rem] text-center">
                      {pendingApprovals}
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-xs lg:text-sm text-left w-full leading-relaxed",
                  isActive ? "text-white/80" : "text-muted-foreground"
                )}>
                  {item.description}
                </p>
              </Button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}