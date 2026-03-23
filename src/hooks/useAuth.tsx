import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'client'
  golf_course_id: number | null
  approved: boolean
  full_name: string | null
  created_at: string
  updated_at: string
  active_golf_courses?: {
    id: number
    name: string
    location: string
  } | null
  client_golf_courses?: {
    active_golf_courses: {
      id: number
      name: string
      location: string
    } | null
  }[]
}

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, firstName: string, lastName: string, golfCourseName: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Type guard for active_golf_courses
function isActiveGolfCourse(obj: any): obj is { id: number; name: string; location: string } {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'id' in obj &&
    'name' in obj &&
    'location' in obj
  );
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      console.log('🔍 Fetching user profile for userId:', userId)
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          active_golf_courses (
            id,
            name,
            location
          ),
          client_golf_courses (
            active_golf_courses (
              id,
              name,
              location
            )
          )
        `)
        .eq('id', userId)
        .single()
      
      console.log('📊 User profile data:', data)
      console.log('❌ User profile error:', error)
      
      if (error) {
        console.error('Error fetching user profile:', error)
        return null
      }
      
      // Transform the data to match our interface
      let activeGolfCourse = null;
      if (data.active_golf_courses && isActiveGolfCourse(data.active_golf_courses)) {
        activeGolfCourse = data.active_golf_courses;
      }
      
      const profile = {
        id: data.id,
        email: data.email,
        role: data.role as 'admin' | 'client',
        golf_course_id: data.golf_course_id,
        approved: data.approved,
        full_name: data.full_name,
        created_at: data.created_at,
        updated_at: data.updated_at,
        active_golf_courses: activeGolfCourse,
        client_golf_courses: data.client_golf_courses as any
      }
      
      console.log('✅ Final user profile:', profile)
      return profile
    } catch (error) {
      console.error('Error fetching user profile:', error)
      return null
    }
  }

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
          // Fetch user profile after authentication
          setTimeout(async () => {
            const profile = await fetchUserProfile(session.user.id)
            setUserProfile(profile)
            setLoading(false)
          }, 0)
        } else {
          setUserProfile(null)
          setLoading(false)
        }
      }
    )

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id)
        setUserProfile(profile)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { error }
  }

  const signUp = async (email: string, password: string, firstName: string, lastName: string, golfCourseName: string) => {
    const redirectUrl = `${window.location.origin}/`
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
          golf_course_name: golfCourseName
        }
      }
    })

    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    })
    return { error }
  }

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    return { error }
  }

  const value = {
    user,
    userProfile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}