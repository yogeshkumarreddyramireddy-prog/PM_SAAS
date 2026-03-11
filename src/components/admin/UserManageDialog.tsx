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
import { useUpdateUserRole } from "@/hooks/useSupabaseQuery"
import { Loader2 } from "lucide-react"

interface UserManageDialogProps {
  userId: string
  userName: string
  currentRole: string
  children: React.ReactNode
}

export function UserManageDialog({
  userId,
  userName,
  currentRole,
  children,
}: UserManageDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState(currentRole)
  const updateUserRole = useUpdateUserRole()

  const handleSave = () => {
    if (selectedRole === currentRole) {
      setOpen(false)
      return
    }

    updateUserRole.mutate(
      { userId, role: selectedRole },
      {
        onSuccess: () => {
          setOpen(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage User Role</DialogTitle>
          <DialogDescription>
            Change the role for {userName}. This will take effect immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <div className="col-span-3">
              <Select value={selectedRole} onValueChange={setSelectedRole} disabled={updateUserRole.isPending}>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={updateUserRole.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateUserRole.isPending || selectedRole === currentRole}>
            {updateUserRole.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
