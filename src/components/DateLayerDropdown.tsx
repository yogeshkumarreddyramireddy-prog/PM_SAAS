import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Clock, Layers } from 'lucide-react'


import { GolfCourseTileset } from "@/lib/tilesetService"

interface DateLayerDropdownProps {
  tilesets: GolfCourseTileset[]
  selectedLayers: string[] // [leftLayerId, rightLayerId]
  onLayerChange: (leftLayerId: string, rightLayerId: string | null) => void
}

const DateLayerDropdown = ({
  tilesets,
  selectedLayers,
  onLayerChange
}: DateLayerDropdownProps) => {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return ''
    return timeStr.substring(0, 5) // Return "HH:MM"
  }

  const formatDisplayText = (tileset: GolfCourseTileset) => {
    const date = formatDate(tileset.flight_date)
    const time = formatTime(tileset.flight_time)
    return time ? `${date} at ${time}` : date
  }

  const handleLeftLayerChange = (tilesetId: string) => {
    const rightLayerId = selectedLayers[1] || null
    onLayerChange(tilesetId, rightLayerId)
  }

  const handleRightLayerChange = (tilesetId: string) => {
    const leftLayerId = selectedLayers[0]
    if (tilesetId === 'none') {
      onLayerChange(leftLayerId, null)
    } else {
      onLayerChange(leftLayerId, tilesetId)
    }
  }

  if (tilesets.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">No tilesets available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Primary Layer Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Primary Layer
          </Label>
          <Select 
            value={selectedLayers[0] || ''} 
            onValueChange={handleLeftLayerChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select primary layer" />
            </SelectTrigger>
            <SelectContent>
              {tilesets.map((tileset) => (
                <SelectItem key={tileset.id} value={tileset.id}>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(tileset.flight_date)}</span>
                    {tileset.flight_time && (
                      <>
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(tileset.flight_time)}</span>
                      </>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Comparison Layer Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Compare With (Optional)
          </Label>
          <Select 
            value={selectedLayers[1] || 'none'} 
            onValueChange={handleRightLayerChange}
            disabled={!selectedLayers[0]}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select layer to compare" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">None (Single layer)</span>
              </SelectItem>
              {tilesets
                .filter(t => t.id !== selectedLayers[0])
                .map((tileset) => (
                  <SelectItem key={tileset.id} value={tileset.id}>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(tileset.flight_date)}</span>
                      {tileset.flight_time && (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(tileset.flight_time)}</span>
                        </>
                      )}
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Info Text */}
        {selectedLayers.length === 2 && selectedLayers[1] && (
          <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded">
            <p>
              <strong>Swipe Mode Active:</strong> Drag the slider on the map to compare{' '}
              {formatDisplayText(tilesets.find(t => t.id === selectedLayers[0])!)} (left) vs{' '}
              {formatDisplayText(tilesets.find(t => t.id === selectedLayers[1])!)} (right)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default DateLayerDropdown
