import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import phytoMapsLogo from "/lovable-uploads/b377485b-420a-475e-81d5-4cb44b625614.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
interface ClientHeaderProps {
  golfCourseName: string;
  userName?: string;
  onLogout: () => void;
  activeCourseId?: number;
  assignedCourses?: any[];
  onCourseChange?: (id: number) => void;
}
export const ClientHeader = ({
  golfCourseName,
  userName,
  onLogout,
  activeCourseId,
  assignedCourses = [],
  onCourseChange
}: ClientHeaderProps) => {
  return <header className="bg-white/95 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center gap-2 sm:gap-4">
            <img src={phytoMapsLogo} alt="PhytoMaps Logo" className="h-10 w-10 sm:h-16 sm:w-16 lg:h-20 lg:w-20 object-contain" />
            <div className="hidden sm:block">
              <h1 className="font-bold text-primary-teal text-lg sm:text-2xl lg:text-3xl">
                PhytoMaps
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-gray-950">
                Course Analytics
              </p>
            </div>
            <div className="sm:hidden">
              <h1 className="font-bold text-primary-teal text-base">PhytoMaps</h1>
            </div>
          </div>

          {/* Golf Course Name - Center on desktop, hidden on mobile */}
          <div className="text-center hidden lg:block">
            <h2 className="font-bold text-foreground text-xl lg:text-2xl">
              {golfCourseName}
            </h2>
            <p className="text-xs lg:text-sm text-gray-950">
              Golf Course Management Portal
            </p>
          </div>

          {/* User Info, Course Switcher & Logout */}
          <div className="flex items-center gap-2 sm:gap-4">
            {assignedCourses.length > 1 && onCourseChange && (
              <div className="hidden sm:block">
                <Select 
                  value={activeCourseId?.toString()} 
                  onValueChange={(val) => onCourseChange(parseInt(val))}
                >
                  <SelectTrigger className="w-[180px] h-8 bg-background text-foreground border-border truncate">
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
            
            {userName && <div className="flex items-center gap-2 sm:gap-3">
                <Avatar className="h-6 w-6 sm:h-8 sm:w-8">
                  <AvatarFallback className="bg-primary-teal/10 text-primary-teal font-medium text-xs sm:text-base">
                    {userName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                
                <div className="text-right hidden sm:block">
                  <p className="font-semibold text-sm sm:text-base">{userName}</p>
                </div>
              </div>}
            
            <Button variant="teal-outline" size="sm" onClick={onLogout} className="text-xs sm:text-sm lg:text-base font-bold px-2 sm:px-4 touch-target-md">
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </div>
        </div>
        
        {/* Course Switcher (Mobile) */}
        {assignedCourses.length > 1 && onCourseChange && (
          <div className="sm:hidden mt-2 flex justify-center w-full">
            <Select 
              value={activeCourseId?.toString()} 
              onValueChange={(val) => onCourseChange(parseInt(val))}
            >
              <SelectTrigger className="w-full max-w-[200px] h-8 bg-background text-foreground border-border truncate text-xs">
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
        
        {/* Golf Course Name - Mobile version */}
        <div className="text-center mt-2 sm:mt-0 lg:hidden">
          <h2 className="font-bold text-foreground text-sm sm:text-lg">
            {golfCourseName}
          </h2>
        </div>
      </div>
    </header>;
};