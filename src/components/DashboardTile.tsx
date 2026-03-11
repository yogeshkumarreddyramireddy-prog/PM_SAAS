import { Button } from "@/components/ui/button"
import { LucideIcon } from "lucide-react"

interface DashboardTileProps {
  title: string
  description: string
  icon: LucideIcon
  count?: number
  badge?: string
  onClick: () => void
}

export const DashboardTile = ({ 
  title, 
  description, 
  icon: Icon, 
  count, 
  badge,
  onClick 
}: DashboardTileProps) => {
  return (
    <Button
      variant="tile"
      size="tile"
      onClick={onClick}
      className="relative touch-target-lg hover:scale-[1.02] transition-all duration-200 min-h-[140px] sm:min-h-[160px]"
    >
      {badge && (
        <div className="absolute top-2 right-2 bg-warning-amber text-white text-xs px-2 py-1 rounded-full font-semibold z-10">
          {badge}
        </div>
      )}
      
      <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-primary-teal mb-2 flex-shrink-0" />
      
      <div className="text-center space-y-1 sm:space-y-2">
        <h3 className="font-semibold text-sm sm:text-base lg:text-lg leading-tight">{title}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
        
        {count !== undefined && !isNaN(count) && (
          <div className="pt-1">
            <span className="text-lg sm:text-xl lg:text-2xl font-bold text-primary-teal">{count}</span>
            <span className="text-xs sm:text-sm text-muted-foreground ml-1">
              {count === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}
      </div>
    </Button>
  )
}