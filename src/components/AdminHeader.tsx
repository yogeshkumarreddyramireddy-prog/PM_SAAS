import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import phytoMapsLogo from "/lovable-uploads/b377485b-420a-475e-81d5-4cb44b625614.png";
interface AdminHeaderProps {
  userName: string;
  onLogout: () => void;
  pendingApprovals?: number;
}
export const AdminHeader = ({
  userName,
  onLogout,
  pendingApprovals = 0
}: AdminHeaderProps) => {
  return <header className="bg-white/95 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center gap-2 sm:gap-4">
            <img src={phytoMapsLogo} alt="PhytoMaps Logo" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-bold text-primary-teal">
                PhytoMaps Admin
              </h1>
              <p className="text-xs text-muted-foreground">
                Platform Management
              </p>
            </div>
            <div className="sm:hidden">
              <h1 className="text-base font-bold text-primary-teal">Admin</h1>
            </div>
          </div>

          {/* Admin Info & Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {pendingApprovals > 0 && <Badge variant="destructive" className="animate-pulse text-xs">
                <span className="hidden sm:inline">{pendingApprovals} Pending</span>
                <span className="sm:hidden">{pendingApprovals}</span>
              </Badge>}
            
            <div className="flex items-center gap-2 sm:gap-3">
              <Avatar className="h-6 w-6 sm:h-8 sm:w-8">
                <AvatarFallback className="bg-primary-teal/10 text-primary-teal text-sm">
                  {userName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              
              <div className="text-right hidden sm:block">
                <p className="font-semibold text-sm">{userName}</p>
                <p className="text-xs text-muted-foreground">Administrator</p>
              </div>
              
              <Button variant="teal-outline" size="sm" onClick={onLogout} className="text-xs sm:text-sm px-2 sm:px-4">
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Exit</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>;
};