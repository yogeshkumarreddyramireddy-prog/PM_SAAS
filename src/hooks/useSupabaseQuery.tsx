import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'

// Hook for fetching golf courses
export const useGolfCourses = () => {
  return useQuery({
    queryKey: ['golf-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('active_golf_courses')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    }
  })
}

// Hook for updating a golf course
export const useUpdateGolfCourse = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: number, updates: any }) => {
      const { error } = await supabase
        .from('active_golf_courses')
        .update(updates)
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['golf-courses'] })
      toast({
        title: 'Settings Saved',
        description: 'Golf course settings updated successfully.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update golf course settings.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for creating a new golf course
export const useCreateGolfCourse = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ name, max_users = 5, signup_enabled = true }: { name: string, max_users?: number, signup_enabled?: boolean }) => {
      const { error } = await supabase
        .from('active_golf_courses')
        .insert({ name, max_users, signup_enabled })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['golf-courses'] })
      toast({
        title: 'Golf Course Created',
        description: 'New active golf course has been added successfully.',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create golf course.',
        variant: 'destructive'
      })
    }
  })
}

export const useDeleteGolfCourse = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.functions.invoke('manage-client-courses', {
        body: { action: 'delete-course', courseId: id }
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['golf-courses'] })
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['all-golf-courses'] })
      toast({
        title: 'Golf Course Deleted',
        description: 'The golf course has been permanently deleted.',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error Deleting Course',
        description: err.message || 'Failed to delete golf course.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for assigning a golf course to a client
export const useAssignGolfCourse = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ clientId, golfCourseId }: { clientId: string, golfCourseId: number }) => {
      const { data, error } = await supabase.functions.invoke('manage-client-courses', {
        body: { action: 'assign', clientId, golfCourseId }
      })

      if (error) throw error
      if (data.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['golf-courses'] })
      toast({
        title: 'Course Assigned',
        description: 'Successfully assigned golf course to user.',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error Assinging Course',
        description: err.message || 'Failed to assign course to user.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for removing a golf course from a client
export const useRemoveGolfCourse = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ clientId, golfCourseId }: { clientId: string, golfCourseId: number }) => {
      const { data, error } = await supabase.functions.invoke('manage-client-courses', {
        body: { action: 'remove', clientId, golfCourseId }
      })

      if (error) throw error
      if (data.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['golf-courses'] })
      toast({
        title: 'Course Removed',
        description: 'Successfully removed golf course from user.',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Error Removing Course',
        description: err.message || 'Failed to remove course from user.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for completely deleting a user
export const useDeleteUser = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      })

      if (error) throw error
      if (data.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      toast({
        title: 'User Deleted',
        description: 'Successfully deleted the user and all associated records.',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Deletion Failed',
        description: err.message || 'Failed to totally delete user.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for approving a pending user and creating/assigning their active golf course
export const useApproveUser = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('approve-user', {
        body: { userId }
      })

      if (error) throw error
      if (data.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['golf-courses'] })
      toast({
        title: 'User Approved',
        description: 'Successfully approved user and synced their golf courses.',
      })
    },
    onError: (err: any) => {
      toast({
        title: 'Approval Failed',
        description: err.message || 'Failed to approve user.',
        variant: 'destructive'
      })
    }
  })
}
export const useUserProfiles = () => {
  return useQuery({
    queryKey: ['user-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          active_golf_courses:golf_course_id (
            *
          ),
          client_golf_courses (
            active_golf_courses (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    }
  })
}

// Hook for fetching content files for a specific golf course
export const useContentFiles = (golfCourseId?: number) => {
  return useQuery({
    queryKey: ['content-files', golfCourseId],
    queryFn: async () => {
      console.log('🔍 useContentFiles called with golfCourseId:', golfCourseId)

      if (!golfCourseId) {
        console.log('❌ No golf course ID provided, returning empty array')
        return []
      }

      const { data, error } = await supabase
        .from('content_files')
        .select(`
          *,
          content_categories (
            id,
            name,
            description
          )
        `)
        .eq('golf_course_id', golfCourseId)
        .order('created_at', { ascending: false })

      console.log('📊 Content files data:', data)
      console.log('❌ Content files error:', error)

      if (error) throw error
      return data
    },
    enabled: !!golfCourseId
  })
}

// Hook for fetching content categories
export const useContentCategories = () => {
  return useQuery({
    queryKey: ['content-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_categories')
        .select('*')
        .order('name')

      if (error) throw error
      return data
    }
  })
}

// Hook for suspending/unsuspending user access
export const useUserSuspension = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ userId, suspended, reason }: { userId: string, suspended: boolean, reason?: string }) => {
      const updateData: any = {
        access_suspended: suspended,
        suspended_at: suspended ? new Date().toISOString() : null,
        suspended_by: suspended ? (await supabase.auth.getUser()).data.user?.id : null,
        suspension_reason: suspended ? reason : null
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      toast({
        title: 'User Access Updated',
        description: 'User access status has been updated successfully.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update user access. Please try again.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for fetching access requests
export const useAccessRequests = () => {
  return useQuery({
    queryKey: ['access-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_requests')
        .select(`
          id,
          user_id,
          request_type,
          message,
          status,
          created_at,
          reviewed_at,
          reviewed_by
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Manually fetch user profiles for each request
      const requestsWithProfiles = await Promise.all(
        data.map(async (request) => {
          const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select(`
              id,
              email,
              full_name,
              active_golf_courses (
                name,
                location
              )
            `)
            .eq('id', request.user_id)
            .single()

          if (profileError) {
            console.error('Error fetching user profile:', profileError)
            return {
              ...request,
              user_profiles: null
            }
          }

          return {
            ...request,
            user_profiles: userProfile
          }
        })
      )

      return requestsWithProfiles
    }
  })
}

// Hook for managing access requests
export const useAccessRequestApproval = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ requestId, status, userId }: { requestId: string, status: 'approved' | 'rejected', userId: string }) => {
      const currentUser = await supabase.auth.getUser()

      // Update the access request
      const { error: requestError } = await supabase
        .from('access_requests')
        .update({
          status,
          reviewed_by: currentUser.data.user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (requestError) throw requestError

      // If approved, restore user access
      if (status === 'approved') {
        const { error: userError } = await supabase
          .from('user_profiles')
          .update({
            access_suspended: false,
            access_request_pending: false,
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null
          })
          .eq('id', userId)

        if (userError) throw userError
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['access-requests'] })
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      toast({
        title: status === 'approved' ? 'Access Approved' : 'Request Rejected',
        description: status === 'approved'
          ? 'Access approved by admin. User can now proceed with login.'
          : 'Access request has been rejected.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to process access request. Please try again.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for creating access requests (for users)
export const useCreateAccessRequest = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const currentUser = await supabase.auth.getUser()

      const { error } = await supabase
        .from('access_requests')
        .insert({
          user_id: currentUser.data.user?.id,
          request_type: 'restore_access',
          message,
        })

      if (error) throw error

      // Update user profile to mark request as pending
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          access_request_pending: true,
          access_requested_at: new Date().toISOString()
        })
        .eq('id', currentUser.data.user?.id)

      if (profileError) throw profileError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-requests'] })
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      toast({
        title: 'Request Submitted',
        description: 'Your access request has been submitted for admin review.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to submit access request. Please try again.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for approving/declining user access
export const useUserApproval = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ userId, approved }: { userId: string, approved: boolean }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ approved })
        .eq('id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      toast({
        title: 'User Status Updated',
        description: 'User access has been updated successfully.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update user status. Please try again.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for deleting content files
export const useDeleteContentFile = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ fileId, objectKey, bucketName, deleteFolder }: { fileId: string, objectKey?: string, bucketName?: string, deleteFolder?: boolean }) => {
      console.log('Delete mutation called with fileId:', fileId)

      // Force session refresh before getting the token
      await supabase.auth.getSession()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('No session found')
        throw new Error('Not authenticated')
      }

      console.log('Making delete request to:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`)

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ fileId, objectKey, bucketName, deleteFolder }),
        })

        console.log('Delete response status:', response.status)
        console.log('Delete response headers:', Object.fromEntries(response.headers.entries()))

        if (!response.ok) {
          let errorData
          try {
            errorData = await response.json()
            console.error('Delete error response:', errorData)
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError)
            const responseText = await response.text()
            console.error('Raw error response:', responseText)
            throw new Error(`Delete failed with status ${response.status}: ${responseText}`)
          }
          throw new Error(errorData.error || `Delete failed with status ${response.status}`)
        }

        const result = await response.json()
        console.log('Delete successful:', result)
        return result
      } catch (fetchError) {
        console.error('Fetch error during delete:', fetchError)
        throw fetchError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-files'] })
      toast({
        title: 'File Deleted',
        description: 'Content file has been deleted successfully.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete file. Please try again.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for updating a user's role
export const useUpdateUserRole = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string, role: string }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profiles'] })
      toast({
        title: 'User Role Updated',
        description: 'User role has been updated successfully.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update user role. Please try again.',
        variant: 'destructive'
      })
    }
  })
}

// Hook for fetching all golf courses (not just active)
export const useAllGolfCourses = () => {
  return useQuery<{ id: number; name: string }[]>({
    queryKey: ['all-golf-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('all_golf_courses' as any)
        .select('id, name')
        .order('name', { ascending: true })
      if (error) throw error
      function isGolfCourse(obj: any): obj is { id: number; name: string } {
        return obj && typeof obj.id === 'number' && typeof obj.name === 'string';
      }
      const arr = (data ?? []) as unknown[];
      const filtered = arr.filter(isGolfCourse);
      return filtered;
    }
  })
}
