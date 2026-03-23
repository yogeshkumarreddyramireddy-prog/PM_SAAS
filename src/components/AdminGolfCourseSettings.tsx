import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Settings, Users, ToggleLeft, Plus, Trash2 } from "lucide-react"
import { useGolfCourses, useUpdateGolfCourse, useCreateGolfCourse, useDeleteGolfCourse } from "@/hooks/useSupabaseQuery"
import { useToast } from "@/hooks/use-toast"

export const AdminGolfCourseSettings = () => {
  const { data: courses, isLoading } = useGolfCourses()
  const updateCourseMutation = useUpdateGolfCourse()
  const createCourseMutation = useCreateGolfCourse()
  const deleteCourseMutation = useDeleteGolfCourse()
  const { toast } = useToast()

  const [newCourseName, setNewCourseName] = useState("")

  const handleUpdateMaxUsers = (courseId: number, maxUsers: number) => {
    updateCourseMutation.mutate({ id: courseId, updates: { max_users: maxUsers } })
  }

  const handleUpdateSignupEnabled = (courseId: number, enabled: boolean) => {
    updateCourseMutation.mutate({ id: courseId, updates: { signup_enabled: enabled } })
  }

  const handleCreateCourse = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCourseName.trim()) {
      toast({ title: "Name is required", variant: "destructive" })
      return
    }
    createCourseMutation.mutate(
      { name: newCourseName },
      {
        onSuccess: () => setNewCourseName("")
      }
    )
  }

  if (isLoading) {
    return <div className="p-8 text-center">Loading golf course settings...</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary-teal" />
            Create New Active Golf Course
          </CardTitle>
          <CardDescription>
            Adding a course here makes it available for immediate assignment to users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateCourse} className="flex gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label htmlFor="courseName">Golf Course Name</Label>
              <Input
                id="courseName"
                placeholder="e.g. Augusta National Golf Club"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="teal" disabled={createCourseMutation.isPending}>
              {createCourseMutation.isPending ? "Creating..." : "Create Course"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary-teal" />
            Manage Active Golf Courses
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure user limits and signup permissions for each golf course
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {!courses || courses.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No active golf courses found.</p>
            ) : (
              courses.map((course) => (
                <div key={course.id} className="p-6 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{course.name}</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Are you sure you want to completely delete "${course.name}"? This action cannot be undone and will delete all associated layers and client assignments.`)) {
                          deleteCourseMutation.mutate(course.id)
                        }
                      }}
                      disabled={deleteCourseMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Max Users Setting */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Maximum Users
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        defaultValue={course.max_users || 5}
                        onBlur={(e) => handleUpdateMaxUsers(course.id, parseInt(e.target.value) || 1)}
                        className="w-full"
                        disabled={deleteCourseMutation.isPending}
                      />
                    </div>
                    
                    {/* Signup Enabled Toggle */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <ToggleLeft className="h-4 w-4" />
                        Allow Select In Signup
                      </Label>
                      <div className="flex items-center space-x-2 pt-2">
                        <Switch
                          checked={course.signup_enabled !== false}
                          onCheckedChange={(enabled) => handleUpdateSignupEnabled(course.id, enabled)}
                          disabled={deleteCourseMutation.isPending}
                        />
                        <span className="text-sm text-muted-foreground">
                          {course.signup_enabled !== false ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Global Settings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Platform-wide configuration options
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Default Maximum Users per Course</Label>
              <p className="text-sm text-muted-foreground">Applied to new golf courses</p>
            </div>
            <Input type="number" defaultValue="5" className="w-20" />
          </div>
          
          <div className="flex justify-end pt-4">
            <Button variant="teal">
              Save Global Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}