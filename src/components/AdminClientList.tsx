import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2 } from "lucide-react"

// Mock data for golf course clients
const mockClients = [
  {
    id: 1,
    name: "Augusta National Golf Club",
    lastUpload: "2024-01-15",
    totalFiles: 45,
    location: "Georgia, USA"
  },
  {
    id: 2,
    name: "Pebble Beach Golf Links",
    lastUpload: "2024-01-12",
    totalFiles: 32,
    location: "California, USA"
  },
  {
    id: 3,
    name: "St. Andrews Links",
    lastUpload: "2024-01-10",
    totalFiles: 67,
    location: "Scotland, UK"
  },
  {
    id: 4,
    name: "Pinehurst Resort",
    lastUpload: "2024-01-08",
    totalFiles: 28,
    location: "North Carolina, USA"
  }
]

interface AdminClientListProps {
  onClientSelect: (clientId: number) => void
}

export const AdminClientList = ({ onClientSelect }: AdminClientListProps) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary-teal" />
          Golf Course Clients
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Click on any client to manage their files and data
        </p>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {mockClients.map((client) => (
            <div
              key={client.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:shadow-card transition-smooth cursor-pointer"
              onClick={() => onClientSelect(client.id)}
            >
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{client.name}</h3>
                <p className="text-sm text-muted-foreground">{client.location}</p>
              </div>
              
              <div className="text-center px-4">
                <p className="text-2xl font-bold text-primary-teal">{client.totalFiles}</p>
                <p className="text-xs text-muted-foreground">Total Files</p>
              </div>
              
              <div className="text-right">
                <p className="text-sm font-medium">Last Upload</p>
                <p className="text-sm text-muted-foreground">{formatDate(client.lastUpload)}</p>
              </div>
              
              <Button variant="teal-outline" size="sm" className="ml-4">
                Manage Files
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}