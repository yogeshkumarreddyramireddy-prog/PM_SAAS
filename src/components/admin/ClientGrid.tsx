
import { Card } from "@/components/ui/card"
import { ClientCard } from "./ClientCard"

interface ClientGridProps {
  clients: Array<{
    id: number
    name: string
    location: string | null
    max_users?: number
    created_at: string
  }>
  userProfiles: Array<{
    golf_course_id: number
    approved: boolean
  }>
  onViewContent: (clientId: number) => void
  onViewSettings: (clientId: number) => void
}

export const ClientGrid = ({ clients, userProfiles, onViewContent, onViewSettings }: ClientGridProps) => {
  const getClientStats = (courseId: number) => {
    const users = userProfiles.filter(user => user.golf_course_id === courseId)
    return {
      activeUsers: users.filter(user => user.approved).length,
      totalUsers: users.length,
      pendingUsers: users.filter(user => !user.approved).length
    }
  }

  if (clients.length === 0) {
    return (
      <Card className="text-center p-8">
        <p className="text-muted-foreground">No clients found matching your search.</p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {clients.map((client) => {
        const stats = getClientStats(client.id)
        return (
          <ClientCard
            key={client.id}
            client={client}
            stats={stats}
            onViewContent={onViewContent}
            onViewSettings={onViewSettings}
          />
        )
      })}
    </div>
  )
}
