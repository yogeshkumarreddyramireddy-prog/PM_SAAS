import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Image, Calendar, Loader2, FolderOpen, HardDrive, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { downloadZip } from 'client-zip'

interface UploadSession {
    sessionKey: string        // e.g. "Augusta_National_Golf_Club/client/2026-03-09_20-50"
    courseName: string
    dateTime: string
    role: string              // 'client' or 'admin'
    imageCount: number
    totalSize: number
    images: ImageRecord[]
}

interface ImageRecord {
    id: string
    filename: string
    original_filename: string
    path: string
    file_size: number
    content_type: string
    created_at: string
    user_id: string
}

interface AdminClientRawUploadsProps {
    golfCourseId?: number
    golfCourseName?: string
}

export const AdminClientRawUploads = ({ golfCourseId, golfCourseName }: AdminClientRawUploadsProps) => {
    const [sessions, setSessions] = useState<UploadSession[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedSession, setExpandedSession] = useState<string | null>(null)
    const [downloadingSession, setDownloadingSession] = useState<string | null>(null)
    const [downloadProgress, setDownloadProgress] = useState<{ downloaded: number; total: number } | null>(null)

    useEffect(() => {
        fetchUploads()
    }, [golfCourseId])

    const fetchUploads = async () => {
        setLoading(true)
        try {
            // Fetch ALL images — admin sees everything
            let query = (supabase as any).from('images').select('id, filename, original_filename, path, file_size, content_type, created_at, user_id').order('created_at', { ascending: false })

            // If golfCourseName is provided, filter by path prefix
            if (golfCourseName) {
                const sanitizedName = golfCourseName.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
                query = query.like('path', `${sanitizedName}/%`)
            }

            const { data, error } = await query
            if (error) {
                console.error('Error fetching uploads:', error)
                return
            }

            // Group images by upload session (derived from path structure)
            const sessionMap = new Map<string, ImageRecord[]>()
            for (const img of (data || [])) {
                // Path format: CourseName/role/YYYY-MM-DD_HH-MM/raw_images/timestamp_filename
                const parts = img.path.split('/')
                let sessionKey: string
                if (parts.length >= 4) {
                    sessionKey = parts.slice(0, 4).join('/') // CourseName/role/dateTime/pathType
                } else {
                    sessionKey = parts.slice(0, Math.max(1, parts.length - 1)).join('/')
                }
                if (!sessionMap.has(sessionKey)) {
                    sessionMap.set(sessionKey, [])
                }
                sessionMap.get(sessionKey)!.push(img)
            }

            // Convert to array of sessions
            const sessionArray: UploadSession[] = Array.from(sessionMap.entries()).map(([key, images]) => {
                const parts = key.split('/')
                const courseName = parts[0]?.replace(/_/g, ' ') || 'Unknown'
                const role = parts[1] || 'unknown'
                const dateTime = parts[2] || 'unknown'

                return {
                    sessionKey: key,
                    courseName,
                    dateTime,
                    role,
                    imageCount: images.length,
                    totalSize: images.reduce((sum, img) => sum + (img.file_size || 0), 0),
                    images
                }
            })

            setSessions(sessionArray)
        } catch (err) {
            console.error('Error loading uploads:', err)
        } finally {
            setLoading(false)
        }
    }

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    const formatDateTime = (dt: string) => {
        // dt is like "2026-03-09_20-50"
        const [date, time] = dt.split('_')
        if (!date) return dt
        const timeFormatted = time?.replace('-', ':') || ''
        return `${date} ${timeFormatted}`
    }

    const handleDownloadSession = async (session: UploadSession) => {
        setDownloadingSession(session.sessionKey)
        setDownloadProgress({ downloaded: 0, total: session.imageCount })

        try {
            // Get presigned GET URLs in batches of 500
            const allKeys = session.images.map(img => img.path)
            const allUrls: { key: string; url: string }[] = []

            for (let i = 0; i < allKeys.length; i += 500) {
                // Refresh session before each batch
                await supabase.auth.getSession()

                const chunk = allKeys.slice(i, i + 500)
                const { data, error } = await supabase.functions.invoke('r2-sign', {
                    body: {
                        action: 'getBatchGetUrls',
                        keys: chunk,
                        expiresInSeconds: 3600
                    }
                })

                if (error) {
                    throw new Error(`Failed to get download URLs: ${error.message}`)
                }
                if (data?.urls) {
                    allUrls.push(...data.urls)
                }
            }

            // Stream download as ZIP using client-zip
            // Create an async generator that fetches each file
            let successfulFiles = 0;
            async function* fileGenerator() {
                let downloaded = 0
                for (const urlInfo of allUrls) {
                    const originalName = session.images.find(img => img.path === urlInfo.key)?.original_filename
                        || urlInfo.key.split('/').pop()
                        || 'unknown.jpg'

                    try {
                        const resp = await fetch(urlInfo.url, { 
                            mode: 'cors',
                            cache: 'no-store' // Prevent CORS caching issues
                        })
                        if (!resp.ok) {
                            const errText = await resp.text().catch(() => '');
                            throw new Error(`HTTP ${resp.status} ${errText}`);
                        }

                        yield {
                            name: originalName,
                            input: resp
                        }

                        successfulFiles++;
                        downloaded++
                        setDownloadProgress({ downloaded, total: session.imageCount })
                    } catch (err) {
                        console.error(`Skipping ${originalName}: ${err}`)
                        downloaded++
                        setDownloadProgress({ downloaded, total: session.imageCount })
                    }
                }
            }

            const zipName = `${session.courseName.replace(/\s+/g, '_')}_${session.dateTime}_${session.imageCount}imgs.zip`
            
            // Modern stream-to-disk approach (prevents multi-GB RAM crashes)
            if ('showSaveFilePicker' in window) {
                try {
                    const fileHandle = await (window as any).showSaveFilePicker({
                        suggestedName: zipName,
                        types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }]
                    });
                    const writableStream = await fileHandle.createWritable();
                    const response = downloadZip(fileGenerator());
                    await response.body!.pipeTo(writableStream);
                    
                    if (successfulFiles === 0) {
                        alert("Warning: The generated zip is empty because all files failed to download (possible CORS issue).");
                    }
                } catch (err: any) {
                    if (err.name === 'AbortError') {
                        // User cancelled save dialog
                        return;
                    }
                    throw err;
                }
            } else {
                // Fallback to memory blob for older browsers (may crash on large files)
                const zipBlob = await downloadZip(fileGenerator()).blob()
                if (successfulFiles === 0) {
                    alert("Warning: The generated zip is empty because all files failed to download (possible CORS issue).");
                    return;
                }
                const link = document.createElement('a')
                link.href = URL.createObjectURL(zipBlob)
                link.download = zipName
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(link.href)
            }

        } catch (err: any) {
            console.error('Download error:', err)
            alert(`Download failed: ${err.message}`)
        } finally {
            setDownloadingSession(null)
            setDownloadProgress(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary-teal mr-3" />
                <span className="text-muted-foreground">Loading uploads...</span>
            </div>
        )
    }

    if (sessions.length === 0) {
        return (
            <div className="text-center p-12 border-2 border-dashed border-border rounded-lg">
                <Image className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-40" />
                <p className="text-lg font-medium text-muted-foreground">No raw uploads yet</p>
                <p className="text-sm text-muted-foreground mt-1">Client drone images will appear here after upload</p>
            </div>
        )
    }

    const totalImages = sessions.reduce((sum, s) => sum + s.imageCount, 0)
    const totalSize = sessions.reduce((sum, s) => sum + s.totalSize, 0)

    return (
        <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <FolderOpen className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{sessions.length}</p>
                            <p className="text-xs text-muted-foreground">Upload Sessions</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/10">
                            <Image className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalImages.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">Total Images</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                            <HardDrive className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{formatSize(totalSize)}</p>
                            <p className="text-xs text-muted-foreground">Total Storage</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Session List */}
            {sessions.map((session) => {
                const isExpanded = expandedSession === session.sessionKey
                const isDownloading = downloadingSession === session.sessionKey

                return (
                    <Card key={session.sessionKey} className="overflow-hidden">
                        <CardHeader className="p-4 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setExpandedSession(isExpanded ? null : session.sessionKey)}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 rounded-lg bg-primary-teal/10">
                                        <FolderOpen className="h-5 w-5 text-primary-teal" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">{session.courseName}</CardTitle>
                                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5" />
                                                {formatDateTime(session.dateTime)}
                                            </span>
                                            <Badge variant="outline" className="text-xs capitalize">{session.role}</Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="font-semibold">{session.imageCount.toLocaleString()} images</p>
                                        <p className="text-xs text-muted-foreground">{formatSize(session.totalSize)}</p>
                                    </div>

                                    <Button
                                        size="sm"
                                        variant="default"
                                        disabled={isDownloading}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownloadSession(session)
                                        }}
                                        className="min-w-[140px]"
                                    >
                                        {isDownloading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                {downloadProgress ? `${downloadProgress.downloaded}/${downloadProgress.total}` : 'Preparing...'}
                                            </>
                                        ) : (
                                            <>
                                                <Download className="h-4 w-4 mr-2" />
                                                Download ZIP
                                            </>
                                        )}
                                    </Button>

                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                            </div>
                        </CardHeader>

                        {isExpanded && (
                            <CardContent className="p-4 pt-0 border-t">
                                <div className="max-h-[300px] overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-muted-foreground border-b sticky top-0 bg-card">
                                            <tr>
                                                <th className="text-left py-2 px-2">#</th>
                                                <th className="text-left py-2 px-2">Filename</th>
                                                <th className="text-right py-2 px-2">Size</th>
                                                <th className="text-right py-2 px-2">Uploaded</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {session.images.map((img, idx) => (
                                                <tr key={img.id} className="border-b border-border/40 hover:bg-accent/30">
                                                    <td className="py-1.5 px-2 text-muted-foreground">{idx + 1}</td>
                                                    <td className="py-1.5 px-2 font-mono text-xs truncate max-w-[300px]">{img.original_filename || img.filename}</td>
                                                    <td className="py-1.5 px-2 text-right text-muted-foreground">{formatSize(img.file_size || 0)}</td>
                                                    <td className="py-1.5 px-2 text-right text-muted-foreground">
                                                        {new Date(img.created_at).toLocaleTimeString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                )
            })}
        </div>
    )
}
