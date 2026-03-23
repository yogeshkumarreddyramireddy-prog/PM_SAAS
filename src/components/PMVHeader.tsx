import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import phytoMapsLogo from "/lovable-uploads/b377485b-420a-475e-81d5-4cb44b625614.png"

interface PMVHeaderProps {
  userType?: 'admin' | 'client'
  userInfo?: {
    name: string
    role?: string
  }
  onLogout?: () => void
  assignedCourses?: any[]
  activeCourseId?: number
  onCourseChange?: (id: number) => void
}

export const PMVHeader = ({ 
  userType, 
  userInfo, 
  onLogout,
  assignedCourses = [],
  activeCourseId,
  onCourseChange
}: PMVHeaderProps) => {
  return (
    <header className="w-full bg-white/20 backdrop-blur-sm border-b border-white/30">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        {/* Logo Section */}
        <div className="flex items-center gap-2 sm:gap-4">
          <img 
            src={phytoMapsLogo} 
            alt="PhytoMaps Logo" 
            className="h-8 w-8 sm:h-12 sm:w-12 object-contain"
          />
          <div className="hidden sm:block">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              PhytoMaps
            </h1>
            <p className="text-xs sm:text-sm text-white/80">
              Farming with Foresight
            </p>
          </div>
          <div className="sm:hidden">
            <h1 className="text-lg font-bold text-white">PhytoMaps</h1>
          </div>
        </div>

        {/* User Info, Course Switcher & Logout */}
        {userInfo && (
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* Course Switcher for Clients */}
            {userType === 'client' && assignedCourses.length > 1 && onCourseChange && (
              <div className="hidden sm:block">
                <Select 
                  value={activeCourseId?.toString()} 
                  onValueChange={(val) => onCourseChange(parseInt(val))}
                >
                  <SelectTrigger className="w-[180px] h-8 bg-white/10 text-white border-white/30 truncate">
                    <SelectValue placeholder="Switch Course" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignedCourses.map(course => (
                      <SelectItem key={course.id} value={course.id.toString()}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="text-right hidden sm:block">
              <p className="font-semibold text-white text-sm sm:text-base">{userInfo.name}</p>
              {userInfo.role && assignedCourses.length <= 1 && (
                <p className="text-xs sm:text-sm text-white/80 capitalize">{userInfo.role}</p>
              )}
            </div>
            
            {/* Mobile Course Switcher */}
            {userType === 'client' && assignedCourses.length > 1 && onCourseChange && (
              <div className="sm:hidden">
                <Select 
                  value={activeCourseId?.toString()} 
                  onValueChange={(val) => onCourseChange(parseInt(val))}
                >
                  <SelectTrigger className="w-[110px] h-8 bg-white/10 text-white border-white/30 truncate text-xs px-2">
                    <SelectValue placeholder="Course" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignedCourses.map(course => (
                      <SelectItem key={course.id} value={course.id.toString()} className="text-sm">
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {onLogout && (
              <Button 
                variant="teal-outline" 
                size="sm"
                onClick={onLogout}
                className="text-xs sm:text-sm px-2 sm:px-4"
              >
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Exit</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}