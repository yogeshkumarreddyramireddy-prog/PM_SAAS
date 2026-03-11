import { useState } from "react"
import { useGolfCourses, useUserProfiles } from "@/hooks/useSupabaseQuery"
import { AdminClientContent } from "@/components/AdminClientContent"
import { AdminClientSettings } from "@/components/AdminClientSettings"
import { ClientManagementHeader } from "@/components/admin/ClientManagementHeader"
import { ClientStatsCards } from "@/components/admin/ClientStatsCards"
import { ClientGrid } from "@/components/admin/ClientGrid"
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'

export const AdminClientManagement = () => {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedClient, setSelectedClient] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<'list' | 'content' | 'settings'>('list')
  const { toast } = useToast()
  
  const { data: golfCourses = [], isLoading: coursesLoading } = useGolfCourses()
  const { data: userProfiles = [], isLoading: usersLoading } = useUserProfiles()

  const filteredClients = golfCourses.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.location?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleViewContent = (clientId: number) => {
    setSelectedClient(clientId)
    setActiveView('content')
  }

  const handleViewSettings = (clientId: number) => {
    setSelectedClient(clientId)
    setActiveView('settings')
  }

  const handleBackToList = () => {
    setActiveView('list')
    setSelectedClient(null)
  }

  const handleAddClient = async ({ email, password, firstName, lastName, golfCourseName }: { email: string; password: string; firstName: string; lastName: string; golfCourseName: string }) => {
    try {
      // Call the secure edge function to create the user
      const { data, error } = await supabase.functions.invoke('create-client-user', {
        body: { email, password, firstName, lastName, golfCourseName },
      })
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'User creation failed')
      toast({ title: 'Client Added', description: `User ${email} created and assigned to golf club.`, variant: 'default' })
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to add client', variant: 'destructive' })
    }
  }

  if (activeView === 'content' && selectedClient) {
    const client = golfCourses.find(c => c.id === selectedClient)
    return (
      <AdminClientContent 
        client={client!}
        onBack={handleBackToList}
      />
    )
  }

  if (activeView === 'settings' && selectedClient) {
    const client = golfCourses.find(c => c.id === selectedClient)
    return (
      <AdminClientSettings 
        client={client!}
        onBack={handleBackToList}
      />
    )
  }

  if (coursesLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading clients...</p>
        </div>
      </div>
    )
  }

  const activeUsers = userProfiles.filter(user => user.approved).length
  const pendingUsers = userProfiles.filter(user => !user.approved).length

  return (
    <div className="space-y-6">
      <ClientManagementHeader 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onAddClient={handleAddClient}
      />

      <ClientStatsCards 
        totalClients={golfCourses.length}
        activeUsers={activeUsers}
        pendingUsers={pendingUsers}
        totalUsers={userProfiles.length}
      />

      <ClientGrid 
        clients={filteredClients}
        userProfiles={userProfiles}
        onViewContent={handleViewContent}
        onViewSettings={handleViewSettings}
      />
    </div>
  )
}
