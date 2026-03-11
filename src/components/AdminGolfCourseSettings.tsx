import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Settings, Users, CalendarDays, ToggleLeft } from "lucide-react"
import { format } from "date-fns"

// Mock data for golf course settings
const mockCourseSettings = [
  {
    id: 1,
    name: "Augusta National Golf Club",
    maxUsers: 5,
    currentUsers: 2,
    signupEnabled: true,
    accessExpiration: new Date("2024-12-31")
  },
  {
    id: 2,
    name: "Pebble Beach Golf Links",
    maxUsers: 3,
    currentUsers: 1,
    signupEnabled: false,
    accessExpiration: new Date("2024-06-30")
  },
  {
    id: 3,
    name: "St. Andrews Links",
    maxUsers: 8,
    currentUsers: 4,
    signupEnabled: true,
    accessExpiration: new Date("2024-09-15")
  }
]

export const AdminGolfCourseSettings = () => {
  const [settings, setSettings] = useState(mockCourseSettings)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())

  const updateMaxUsers = (courseId: number, maxUsers: number) => {
    setSettings(prev => 
      prev.map(course => 
        course.id === courseId 
          ? { ...course, maxUsers }
          : course
      )
    )
  }

  const updateSignupEnabled = (courseId: number, enabled: boolean) => {
    setSettings(prev => 
      prev.map(course => 
        course.id === courseId 
          ? { ...course, signupEnabled: enabled }
          : course
      )
    )
  }

  const updateAccessExpiration = (courseId: number, date: Date) => {
    setSettings(prev => 
      prev.map(course => 
        course.id === courseId 
          ? { ...course, accessExpiration: date }
          : course
      )
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary-teal" />
            Golf Course Access Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure user limits, signup permissions, and access expiration dates for each golf course
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {settings.map((course) => (
              <div key={course.id} className="p-6 border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{course.name}</h3>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Current Users</p>
                      <p className="text-xl font-bold text-primary-teal">
                        {course.currentUsers}/{course.maxUsers}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      value={course.maxUsers}
                      onChange={(e) => updateMaxUsers(course.id, parseInt(e.target.value) || 1)}
                      className="w-full"
                    />
                  </div>
                  
                  {/* Signup Enabled Toggle */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ToggleLeft className="h-4 w-4" />
                      Allow New Signups
                    </Label>
                    <div className="flex items-center space-x-2 pt-2">
                      <Switch
                        checked={course.signupEnabled}
                        onCheckedChange={(enabled) => updateSignupEnabled(course.id, enabled)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {course.signupEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Access Expiration Date */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Access Expires
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {format(course.accessExpiration, "PPP")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={course.accessExpiration}
                          onSelect={(date) => date && updateAccessExpiration(course.id, date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div className="flex justify-end pt-4">
                  <Button variant="teal" size="sm">
                    Save Settings
                  </Button>
                </div>
              </div>
            ))}
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
          
          <div className="flex items-center justify-between">
            <div>
              <Label>Default Access Duration (months)</Label>
              <p className="text-sm text-muted-foreground">Default expiration period for new accounts</p>
            </div>
            <Input type="number" defaultValue="12" className="w-20" />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Admin Approval for New Users</Label>
              <p className="text-sm text-muted-foreground">All new signups need admin approval</p>
            </div>
            <Switch defaultChecked />
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