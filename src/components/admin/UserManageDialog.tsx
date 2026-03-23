import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useUpdateUserRole, useGolfCourses, useAssignGolfCourse, useRemoveGolfCourse, useDeleteUser } from "@/hooks/useSupabaseQuery"
import { Loader2, Trash2 } from "lucide-react"

interface UserManageDialogProps {
  userId: string
  userName: string
  currentRole: string
  assignedCourseIds: number[]
  children: React.ReactNode
}

export function UserManageDialog({
  userId,
  userName,
  currentRole,
  assignedCourseIds,
  children,
}: UserManageDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState(currentRole)
  const [localCourseIds, setLocalCourseIds] = useState<number[]>(assignedCourseIds)
  
  const updateUserRole = useUpdateUserRole()
  const { data: allCourses = [], isLoading: loadingCourses } = useGolfCourses()
  const assignCourseMutation = useAssignGolfCourse()
  const removeCourseMutation = useRemoveGolfCourse()
  const deleteUserMutation = useDeleteUser()

  const handleCourseToggle = (courseId: number, checked: boolean) => {
    if (checked) {
      setLocalCourseIds(prev => [...prev, courseId])
    } else {
      setLocalCourseIds(prev => prev.filter(c => c !== courseId))
    }
  }

  const handleSave = async () => {
    // 1. Update Role if different
    if (selectedRole !== currentRole) {
      updateUserRole.mutate({ userId, role: selectedRole })
    }

    // 2. Sync golf courses
    const coursesToAdd = localCourseIds.filter(id => !assignedCourseIds.includes(id))
    const coursesToRemove = assignedCourseIds.filter(id => !localCourseIds.includes(id))

    for (const courseId of coursesToAdd) {
      assignCourseMutation.mutate({ clientId: userId, golfCourseId: courseId })
    }

    for (const courseId of coursesToRemove) {
      removeCourseMutation.mutate({ clientId: userId, golfCourseId: courseId })
    }

    setOpen(false)
  }

  const handleDelete = () => {
    if (confirm(`Are you sure you want to completely delete ${userName}? This action cannot be undone.`)) {
      deleteUserMutation.mutate(userId, {
        onSuccess: () => setOpen(false)
      })
    }
  }

  const isSaving = updateUserRole.isPending || assignCourseMutation.isPending || removeCourseMutation.isPending

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (val) {
        setSelectedRole(currentRole)
        setLocalCourseIds(assignedCourseIds)
      }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage User Profile</DialogTitle>
          <DialogDescription>
            Change role and assigned golf courses for {userName}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <div className="col-span-3">
              <Select value={selectedRole} onValueChange={setSelectedRole} disabled={isSaving}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-2">Courses</Label>
            <div className="col-span-3 space-y-3 max-h-48 overflow-y-auto p-1 border rounded-md">
              {loadingCourses ? (
                <Loader2 className="animate-spin w-4 h-4 text-muted-foreground m-2" />
              ) : allCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No courses available.</p>
              ) : (
                allCourses.map(course => (
                  <div key={course.id} className="flex flex-row items-center space-x-3 space-y-0 rounded-md p-2 hover:bg-muted/50">
                    <Checkbox 
                      id={`course-${course.id}`}
                      checked={localCourseIds.includes(course.id)}
                      onCheckedChange={(checked) => handleCourseToggle(course.id, checked as boolean)}
                      disabled={isSaving}
                    />
                    <div className="space-y-1 leading-none">
                      <Label htmlFor={`course-${course.id}`} className="font-normal cursor-pointer">
                        {course.name}
                      </Label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isSaving || deleteUserMutation.isPending} title="Delete User">
            {deleteUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
