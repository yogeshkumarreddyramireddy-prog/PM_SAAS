
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertTriangle, Ban } from "lucide-react"
import { useUserSuspension } from "@/hooks/useSupabaseQuery"

interface UserSuspensionDialogProps {
  userId: string
  userName: string
  isCurrentlySuspended: boolean
  children: React.ReactNode
}

export const UserSuspensionDialog = ({ 
  userId, 
  userName, 
  isCurrentlySuspended, 
  children 
}: UserSuspensionDialogProps) => {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const suspensionMutation = useUserSuspension()

  const handleSuspension = () => {
    if (isCurrentlySuspended) {
      // Restore access
      suspensionMutation.mutate(
        { userId, suspended: false },
        {
          onSuccess: () => {
            setOpen(false)
            setReason("")
          }
        }
      )
    } else {
      // Suspend access
      if (!reason.trim()) return
      
      suspensionMutation.mutate(
        { userId, suspended: true, reason: reason.trim() },
        {
          onSuccess: () => {
            setOpen(false)
            setReason("")
          }
        }
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCurrentlySuspended ? (
              <>
                <AlertTriangle className="h-5 w-5 text-success-green" />
                Restore Access
              </>
            ) : (
              <>
                <Ban className="h-5 w-5 text-destructive" />
                Suspend Access
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isCurrentlySuspended 
              ? `Restore access for ${userName}? They will be able to log in immediately.`
              : `Temporarily suspend access for ${userName}? They will need to request access restoration.`
            }
          </p>
          
          {!isCurrentlySuspended && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for suspension</Label>
              <Textarea
                id="reason"
                placeholder="Enter the reason for suspending this user's access..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant={isCurrentlySuspended ? "teal" : "destructive"}
              onClick={handleSuspension}
              disabled={suspensionMutation.isPending || (!isCurrentlySuspended && !reason.trim())}
            >
              {suspensionMutation.isPending 
                ? "Processing..." 
                : isCurrentlySuspended ? "Restore Access" : "Suspend Access"
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
