import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'client'
  requireApproval?: boolean
  onUnauthorized?: () => void
}

export const ProtectedRoute = ({ 
  children, 
  requiredRole, 
  requireApproval = false,
  onUnauthorized 
}: ProtectedRouteProps) => {
  const { user, userProfile, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      // Check if user is authenticated
      if (!user) {
        onUnauthorized?.()
        return
      }

      // Check if user has required role
      if (requiredRole && userProfile?.role !== requiredRole) {
        onUnauthorized?.()
        return
      }

      // Check if user is approved (for clients)
      if (requireApproval && !userProfile?.approved) {
        onUnauthorized?.()
        return
      }
    }
  }, [user, userProfile, loading, requiredRole, requireApproval, onUnauthorized])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  // If user is not authenticated
  if (!user) {
    return null
  }

  // If user doesn't have required role
  if (requiredRole && userProfile?.role !== requiredRole) {
    return null
  }

  // If user is not approved (for clients)
  if (requireApproval && !userProfile?.approved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 max-w-md mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Account Pending Approval</h2>
          <p className="text-white/80 mb-4">
            Your account is currently pending approval from an administrator. 
            You'll receive an email once your account has been approved.
          </p>
          <p className="text-sm text-white/60">
            If you have any questions, please contact your golf course administrator.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}