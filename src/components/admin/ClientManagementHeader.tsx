import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Building2, Plus, Search, Loader2, EyeOff, Eye } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useCreateGolfCourse } from "@/hooks/useSupabaseQuery"

interface ClientManagementHeaderProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  onAddClient?: (data: { email: string; password: string; firstName: string; lastName: string; golfCourseName: string }) => Promise<void>
}

export const ClientManagementHeader = ({ searchTerm, onSearchChange, onAddClient }: ClientManagementHeaderProps) => {
  const [showModal, setShowModal] = useState(false)
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false)
  
  const createCourseMutation = useCreateGolfCourse()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [golfCourseName, setGolfCourseName] = useState("")

  const resetForm = () => {
    setEmail(""); setPassword(""); setFirstName(""); setLastName(""); setGolfCourseName("")
    setShowPassword(false)
  }

  const handleClose = () => {
    if (!isSubmitting) { setShowModal(false); resetForm() }
  }

  const handleCourseClose = () => {
    if (!isSubmittingCourse) { setShowCourseModal(false); setGolfCourseName("") }
  }

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!golfCourseName.trim()) return

    setIsSubmittingCourse(true)
    try {
      await createCourseMutation.mutateAsync({ name: golfCourseName })
      setShowCourseModal(false)
      setGolfCourseName("")
    } catch {
      // toast is handled in the mutation
    } finally {
      setIsSubmittingCourse(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onAddClient || !email || !password || !firstName || !lastName) return

    setIsSubmitting(true)
    try {
      await onAddClient({ email, password, firstName, lastName, golfCourseName })
      setShowModal(false)
      resetForm()
    } catch {
      // error handled in parent via toast
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Client Management</h1>
          <p className="text-muted-foreground">Manage golf course clients and their access</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowCourseModal(true)}>
            <Building2 className="h-4 w-4" />
            Add Golf Course
          </Button>
          <Button variant="teal" className="gap-2" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" />
            Add New Client
          </Button>
        </div>
      </div>

      <Dialog open={showCourseModal} onOpenChange={handleCourseClose}>
        <DialogContent aria-describedby="add-course-desc">
          <DialogHeader>
            <DialogTitle>Add New Golf Course</DialogTitle>
            <DialogDescription id="add-course-desc">
              Create a new standalone golf course. You can assign users to it later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCourseSubmit} className="space-y-4">
            <div>
              <Label htmlFor="new-course-name">Golf Course Name</Label>
              <Input
                id="new-course-name"
                value={golfCourseName}
                onChange={e => setGolfCourseName(e.target.value)}
                placeholder="e.g. Augusta National Golf Club"
                required
                disabled={isSubmittingCourse}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleCourseClose} disabled={isSubmittingCourse}>Cancel</Button>
              <Button type="submit" variant="teal" disabled={isSubmittingCourse || !golfCourseName.trim()}>
                {isSubmittingCourse ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Building2 className="h-4 w-4 mr-2" />Add Course</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={handleClose}>
        <DialogContent aria-describedby="add-client-desc">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription id="add-client-desc">
              Create a new user account and assign them to a golf course.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="client@example.com"
                required
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="add-password">Password</Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="add-firstName">First Name</Label>
                <Input
                  id="add-firstName"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="add-lastName">Last Name</Label>
                <Input
                  id="add-lastName"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="add-golfCourse">Golf Club Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="add-golfCourse"
                value={golfCourseName}
                onChange={e => setGolfCourseName(e.target.value)}
                placeholder="e.g. Augusta National Golf Club"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground mt-1">If the course doesn't exist, it will be created automatically.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" variant="teal" disabled={isSubmitting || !email || !password || !firstName || !lastName}>
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Add Client</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
