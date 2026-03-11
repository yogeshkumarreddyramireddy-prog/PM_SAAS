import { useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { LandingPage } from "@/components/LandingPage"
import { LoginForm } from "@/components/LoginForm"
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm"
import { SignupForm } from "@/components/SignupForm"
import { AdminDashboard } from "@/components/AdminDashboard"
import { ClientDashboard } from "@/components/ClientDashboard"
import { ClientContentViewer } from "@/components/ClientContentViewer"
import { ClientContentSection } from "@/components/ClientContentSection"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/integrations/supabase/client"

type AppState =
  | { view: 'landing' }
  | { view: 'client-login' }
  | { view: 'admin-login' }
  | { view: 'forgot-password' }
  | { view: 'signup' }
  | { view: 'admin-dashboard' }
  | { view: 'client-dashboard' }
  | { view: 'client-content', section: string }
  | { view: 'client-section', contentType: 'live_maps' | 'reports' | 'hd_maps' | '3d_models' }

export const PMVApp = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const [userProfile, setUserProfile] = useState<any>(null)

  const [appState, setAppState] = useState<AppState>(() => {
    // Determine initial state based on URL
    if (location.pathname === '/admin') {
      return { view: 'admin-login' }
    } else if (location.pathname === '/signup') {
      return { view: 'signup' }
    } else {
      return { view: 'landing' }
    }
  })

  // Fetch user profile when authenticated
  useEffect(() => {
    if (user && !userProfile) {
      const fetchUserProfile = async () => {
        const { data, error } = await supabase
          .from('user_profiles')
          .select(`
            *,
            active_golf_courses (
              id,
              name,
              location
            )
          `)
          .eq('id', user.id)
          .single()

        if (!error && data) {
          setUserProfile(data)
        }
      }
      fetchUserProfile()
    }
  }, [user, userProfile])

  // Update state when authentication or URL changes
  useEffect(() => {
    if (loading) return // Wait for auth to load

    if (user && userProfile) {
      // Check if user is unapproved client
      if (userProfile.role === 'client' && !userProfile.approved) {
        // If they are not approved, they should not be logged in.
        // We let ProtectedRoute or other components show the pending message,
        // but wait, ProtectedRoute isn't used here.
        // If they are on landing, they will loop if we don't handle it.
        // Let's just set them to a special state or sign them out,
        // Actually, we can just sign them out and show a toast, or stay on landing.
        // Since we want to show a pending message, let's let them stay on landing but we sign them out so they don't loop.
        signOut().then(() => {
          setAppState({ view: 'landing' })
          navigate('/', { replace: true })
        })
        return
      }

      // User is authenticated and approved - only auto-redirect if on login pages
      if (appState.view === 'landing' || appState.view === 'admin-login' || appState.view === 'client-login' || appState.view === 'signup') {
        if (userProfile.role === 'admin') {
          setAppState({ view: 'admin-dashboard' })
          if (location.pathname !== '/admin') navigate('/admin', { replace: true })
        } else if (userProfile.role === 'client') {
          setAppState({ view: 'client-dashboard' })
          if (location.pathname !== '/') navigate('/', { replace: true })
        } else {
          // Fallback for weird roles
          signOut().then(() => {
            setAppState({ view: 'landing' })
            navigate('/', { replace: true })
          })
        }
      }
    } else if (user && !userProfile) {
      // User authenticated but profile not loaded yet - wait
      return
    } else {
      // User is not authenticated - redirect dashboard views to login
      if (appState.view === 'admin-dashboard' || appState.view === 'client-dashboard' || appState.view === 'client-content' || appState.view === 'client-section') {
        if (location.pathname === '/admin') {
          setAppState({ view: 'admin-login' })
        } else {
          setAppState({ view: 'landing' })
        }
      }
    }
  }, [user, userProfile, loading, location.pathname, appState.view, navigate, signOut])

  const handleLogin = () => {
    // Authentication is handled by Supabase Auth
    // State will update automatically via useEffect
  }

  const handleLogout = async () => {
    await signOut()
    setAppState({ view: 'landing' })
    navigate('/', { replace: true })
  }

  const handleClientLogin = () => {
    // Authentication handled in LandingPage
    handleLogin()
  }

  const handleAdminLogin = () => {
    setAppState({ view: 'admin-login' })
    navigate('/admin', { replace: true })
  }

  const handleForgotPassword = () => {
    setAppState({ view: 'forgot-password' })
  }

  const handleBackToLogin = () => {
    setAppState({ view: 'landing' })
    navigate('/', { replace: true })
  }

  const handleBackToLoginFromSignup = () => {
    setAppState({ view: 'landing' })
    navigate('/', { replace: true })
  }

  const handleTileClick = (section: string) => {
    const contentTypeMap: Record<string, 'live_maps' | 'reports' | 'hd_maps' | '3d_models'> = {
      'live-maps': 'live_maps',
      'reports': 'reports',
      'hd-maps': 'hd_maps',
      '3d-models': '3d_models'
    }

    const contentType = contentTypeMap[section]
    if (contentType) {
      setAppState({ view: 'client-section', contentType })
    } else {
      setAppState({ view: 'client-content', section })
    }
  }

  const handleBackToDashboard = () => {
    setAppState({ view: 'client-dashboard' })
  }

  // Render based on current state
  switch (appState.view) {
    case 'landing':
      return (
        <LandingPage
          onClientLogin={handleClientLogin}
          onAdminLogin={handleAdminLogin}
          onForgotPassword={handleForgotPassword}
        />
      )

    case 'client-login':
      return (
        <LoginForm
          type="client"
          onLogin={handleLogin}
          onForgotPassword={handleForgotPassword}
        />
      )

    case 'admin-login':
      return (
        <LoginForm
          type="admin"
          onLogin={handleLogin}
          onForgotPassword={handleForgotPassword}
        />
      )

    case 'forgot-password':
      return (
        <ForgotPasswordForm
          onBack={handleBackToLogin}
        />
      )

    case 'signup':
      return (
        <SignupForm
          onBack={handleBackToLoginFromSignup}
        />
      )

    case 'admin-dashboard':
      // Double-check admin role before rendering admin dashboard
      if (userProfile?.role !== 'admin') {
        // Redirect non-admin users away from admin dashboard
        setAppState({ view: 'client-dashboard' })
        navigate('/', { replace: true })
        return null
      }
      return (
        <AdminDashboard
          onLogout={handleLogout}
        />
      )

    case 'client-dashboard':
      // Double-check client role and approved status before rendering client dashboard
      if (userProfile?.role !== 'client' || !userProfile?.approved) {
        // Redirect non-client or unapproved users
        if (userProfile?.role === 'admin') {
          setAppState({ view: 'admin-dashboard' })
          navigate('/admin', { replace: true })
        } else {
          setAppState({ view: 'landing' })
          navigate('/', { replace: true })
        }
        return null
      }
      return (
        <ClientDashboard
          onLogout={handleLogout}
          onTileClick={handleTileClick}
          userFullName={userProfile?.full_name || userProfile?.email || "User"}
          golfCourseName={userProfile?.active_golf_courses?.name || "Golf Course"}
          golfCourseLocation={userProfile?.active_golf_courses?.location}
          golfCourseId={userProfile?.golf_course_id || userProfile?.active_golf_courses?.id}
        />
      )

    case 'client-content':
      return (
        <ClientContentViewer
          golfCourseId={userProfile?.golf_course_id || 1}
          golfCourseName={userProfile?.active_golf_courses?.name || "Golf Course"}
          onBack={handleBackToDashboard}
        />
      )

    case 'client-section':
      return (
        <ClientContentSection
          golfCourseId={userProfile?.golf_course_id || 1}
          golfCourseName={userProfile?.active_golf_courses?.name || "Golf Course"}
          contentType={appState.contentType}
          onBack={handleBackToDashboard}
        />
      )

    default:
      return (
        <LandingPage
          onClientLogin={handleClientLogin}
          onAdminLogin={handleAdminLogin}
        />
      )
  }
}