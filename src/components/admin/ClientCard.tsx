
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Settings, Calendar } from "lucide-react"

interface ClientCardProps {
  client: {
    id: number
    name: string
    location: string | null
    max_users?: number
    created_at: string
  }
  stats: {
    activeUsers: number
    totalUsers: number
    pendingUsers: number
  }
  onViewContent: (clientId: number) => void
  onViewSettings: (clientId: number) => void
}

export const ClientCard = ({ client, stats, onViewContent, onViewSettings }: ClientCardProps) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Card className="shadow-card hover:shadow-hover transition-spring">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1">{client.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{client.location}</p>
          </div>
          <Badge variant="default" className="bg-success-green">
            Active
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* User Info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Active Users:</span>
          <span className="font-medium">
            {stats.activeUsers}/{client.max_users || 5}
          </span>
        </div>

        {/* Pending Users */}
        {stats.pendingUsers > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pending:</span>
            <Badge variant="secondary" className="bg-warning-amber/20 text-warning-amber">
              {stats.pendingUsers}
            </Badge>
          </div>
        )}

        {/* Join Date */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Joined:</span>
          <span className="font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(client.created_at)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onViewContent(client.id)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Content
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onViewSettings(client.id)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
