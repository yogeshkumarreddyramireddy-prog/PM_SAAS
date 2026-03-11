import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ClientManagementHeaderProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  onAddClient?: (data: { email: string; password: string; firstName: string; lastName: string; golfCourseName: string }) => void
}

export const ClientManagementHeader = ({ searchTerm, onSearchChange, onAddClient }: ClientManagementHeaderProps) => {
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [golfCourseName, setGolfCourseName] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (onAddClient && email && password && firstName && lastName && golfCourseName) {
      onAddClient({ email, password, firstName, lastName, golfCourseName })
      setShowModal(false)
      setEmail("")
      setPassword("")
      setFirstName("")
      setLastName("")
      setGolfCourseName("")
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Client Management</h1>
          <p className="text-muted-foreground">Manage golf course clients and their access</p>
        </div>
        <Button variant="teal" className="gap-2" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" />
          Add New Client
        </Button>
      </div>

      {/* Add Client Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="text" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div className="flex-1">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="golfCourse">Golf Club Name</Label>
              <Input id="golfCourse" value={golfCourseName} onChange={e => setGolfCourseName(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="submit" variant="teal">Add Client</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
    </>
  )
}
