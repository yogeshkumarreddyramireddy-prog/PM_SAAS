import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import phytoMapsLogo from "/assets/b377485b-420a-475e-81d5-4cb44b625614.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";
import { useT } from "@/translations";

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
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const t = useT();

  return (
    <header className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center gap-2 sm:gap-4">
            <img src={phytoMapsLogo} alt="PhytoMaps Logo" className="h-14 w-14 sm:h-20 sm:w-20 lg:h-36 lg:w-36 lg:-my-4 object-contain dark:brightness-[1.7] transition-all" />
            <div className="hidden sm:block">
              <h1 className="font-bold text-primary-teal text-lg sm:text-2xl lg:text-3xl">
                PhytoMaps
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-muted-foreground">
                {t.header.tagline}
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
            <p className="text-xs lg:text-sm text-muted-foreground">
              {t.header.portalLabel}
            </p>
          </div>

          {/* User Info, Course Switcher, Language Toggle & Logout */}
          <div className="flex items-center gap-2 sm:gap-4">
            {assignedCourses.length > 1 && onCourseChange && (
              <div className="hidden sm:block" id="tour-course-selector">
                <Select
                  value={activeCourseId?.toString()}
                  onValueChange={(val) => onCourseChange(parseInt(val))}
                >
                  <SelectTrigger className="w-[180px] h-8 bg-background text-foreground border-border truncate">
                    <SelectValue placeholder={t.header.switchCourse} />
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

            {/* Dark Mode Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* Language Toggle */}
            <div
              className="flex items-center rounded-full border border-border overflow-hidden text-xs font-semibold"
              title={t.header.switchLanguageTooltip}
            >
              <button
                onClick={() => setLanguage("en")}
                className={`px-2.5 py-1 transition-colors ${
                  language === "en"
                    ? "bg-primary-teal text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage("nl")}
                className={`px-2.5 py-1 transition-colors ${
                  language === "nl"
                    ? "bg-primary-teal text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                NL
              </button>
            </div>

            {userName && (
              <div className="flex items-center gap-2 sm:gap-3">
                <Avatar className="h-6 w-6 sm:h-8 sm:w-8">
                  <AvatarFallback className="bg-primary-teal/10 text-primary-teal font-medium text-xs sm:text-base">
                    {userName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>

                <div className="text-right hidden sm:block">
                  <p className="font-semibold text-sm sm:text-base">{userName}</p>
                </div>
              </div>
            )}

            <Button variant="teal-outline" size="sm" onClick={onLogout} className="text-xs sm:text-sm lg:text-base font-bold px-2 sm:px-4 touch-target-md">
              <span className="hidden sm:inline">{t.header.logout}</span>
              <span className="sm:hidden">{t.header.logoutShort}</span>
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
                <SelectValue placeholder={t.header.switchCourse} />
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
    </header>
  );
};