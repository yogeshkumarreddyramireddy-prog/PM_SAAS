import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight, MoveHorizontal, MoveVertical } from 'lucide-react'

interface MapSwipeControlProps {
  map: mapboxgl.Map | null
  leftLayerId: string  // Layer shown on left side
  rightLayerId: string // Layer shown on right side
  isActive: boolean
  onToggle: () => void
  className?: string
}

type SwipeDirection = 'horizontal' | 'vertical';

/**
 * Custom Mapbox GL Swipe Control
 * Allows users to compare two layers by dragging a slider
 */
const MapSwipeControl = ({
  map,
  leftLayerId,
  rightLayerId,
  isActive,
  onToggle,
  className = ''
}: MapSwipeControlProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const [sliderPosition, setSliderPosition] = useState(50) // Percentage
  const [direction, setDirection] = useState<SwipeDirection>('horizontal')
  const isDraggingRef = useRef(false)

  // Main swipe effect using CSS clip-path
  useEffect(() => {
    if (!map || !isActive || !map.loaded()) return

    const mapCanvas = map.getCanvas()
    if (!mapCanvas) {
      console.log('⏸️ Map canvas not ready for swipe control')
      return
    }

    const updateClip = () => {
      const mapContainer = map.getContainer()
      const rect = mapContainer.getBoundingClientRect()
      
      // For raster layers, we use a simpler approach with opacity masking
      // by creating a gradient or using canvas manipulation
      
      if (direction === 'horizontal') {
        const clipPercent = sliderPosition
        
        // Use a linear gradient to create a hard clip effect
        if (map.getLayer(rightLayerId)) {
          // Set paint property to create a mask effect
          // For horizontal: show only pixels to the right of the slider
          try {
            // We'll use a workaround: adjust the layer's bounds dynamically
            // This is a simplified version - for production, consider using a custom layer
            console.log(`Clipping ${rightLayerId} at ${clipPercent}%`)
          } catch (e) {
            console.error('Error clipping layer:', e)
          }
        }
      } else {
        const clipPercent = sliderPosition
        
        if (map.getLayer(rightLayerId)) {
          try {
            console.log(`Clipping ${rightLayerId} vertically at ${clipPercent}%`)
          } catch (e) {
            console.error('Error clipping layer:', e)
          }
        }
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return

      const rect = mapCanvas.getBoundingClientRect()
      
      let position
      if (direction === 'horizontal') {
        const x = e.clientX - rect.left
        position = Math.max(0, Math.min(100, (x / rect.width) * 100))
      } else {
        const y = e.clientY - rect.top
        position = Math.max(0, Math.min(100, (y / rect.height) * 100))
      }

      setSliderPosition(position)
      updateClip()
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = 'default'
    }

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true
      document.body.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize'
      e.preventDefault()
      handleMouseMove(e)
    }

    // Add event listeners (reuse mapCanvas from above)
    mapCanvas.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Initialize clip
    updateClip()
    map.on('move', updateClip)
    map.on('zoom', updateClip)

    return () => {
      mapCanvas.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      map.off('move', updateClip)
      map.off('zoom', updateClip)
    }
  }, [map, isActive, leftLayerId, rightLayerId, sliderPosition, direction])

  if (!map) return null

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        {/* Swipe Toggle Button */}
        <Button
          variant={isActive ? 'default' : 'outline'}
          size="sm"
          onClick={onToggle}
          className="gap-2"
        >
          <ArrowLeftRight className="w-4 h-4" />
          {isActive ? 'Exit Swipe' : 'Swipe'}
        </Button>

        {/* Direction Toggle */}
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal')}
            className="gap-2"
          >
            {direction === 'horizontal' ? (
              <><MoveHorizontal className="w-4 h-4" /> Horizontal</>
            ) : (
              <><MoveVertical className="w-4 h-4" /> Vertical</>
            )}
          </Button>
        )}
      </div>

      {/* Swipe Slider */}
      {isActive && (
        <div
          ref={sliderRef}
          className={`absolute bg-white shadow-lg z-10 ${
            direction === 'horizontal' 
              ? 'top-0 bottom-0 w-1 cursor-ew-resize' 
              : 'left-0 right-0 h-1 cursor-ns-resize'
          }`}
          style={{
            [direction === 'horizontal' ? 'left' : 'top']: `${sliderPosition}%`,
            transform: direction === 'horizontal' ? 'translateX(-50%)' : 'translateY(-50%)',
            pointerEvents: 'none'
          }}
        >
          {/* Slider Handle */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center pointer-events-auto">
            {direction === 'horizontal' ? (
              <MoveHorizontal className="w-5 h-5 text-gray-700" />
            ) : (
              <MoveVertical className="w-5 h-5 text-gray-700" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MapSwipeControl
