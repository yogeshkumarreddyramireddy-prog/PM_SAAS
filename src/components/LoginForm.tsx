import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import phytoMapsLogo from "/assets/b377485b-420a-475e-81d5-4cb44b625614.png"
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'

interface LoginFormProps {
  type: 'admin' | 'client'
  onLogin: (credentials: { email: string; password: string }) => void
  onForgotPassword?: () => void
}

export const LoginForm = ({ type, onLogin, onForgotPassword }: LoginFormProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signIn, signOut } = useAuth()
  const { toast } = useToast()

  const validateRoleAndProceed = async (credentials: { email: string; password: string }) => {
    try {
      // Get current user after authentication
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Fetch user profile to check role
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('role, approved')
          .eq('id', user.id)
          .single()
        
        if (error || !profile) {
          toast({
            title: "Profile Error",
            description: "Could not verify user role",
            variant: "destructive"
          })
          await signOut()
          setIsLoading(false)
          return
        }
        
        // Check if role matches the portal type
        if (profile.role !== type) {
          toast({
            title: "Access Denied",
            description: `${profile.role === 'admin' ? 'Admin' : 'Client'} credentials cannot access the ${type} portal.`,
            variant: "destructive"
          })
          await signOut()
          setIsLoading(false)
          return
        }
        
        // Role matches - proceed with login
        onLogin(credentials)
        setIsLoading(false)
      }
    } catch (error) {
      toast({
        title: "Validation Error",
        description: "Could not validate user role",
        variant: "destructive"
      })
      await signOut()
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    console.log("LoginForm submit", { email, password });
    try {
      const { error } = await signIn(email, password)
      
      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive"
        })
        setIsLoading(false)
      } else {
        // Authentication successful - now validate role before proceeding
        await validateRoleAndProceed({ email, password })
      }
    } catch (error) {
      toast({
        title: "Login Failed", 
        description: "An unexpected error occurred",
        variant: "destructive"
      })
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img 
              src={phytoMapsLogo} 
              alt="PhytoMaps Logo" 
              className="h-16 w-16 object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-bold">
            {type === 'admin' ? 'Admin Portal' : 'Client Portal'}
          </CardTitle>
          <p className="text-muted-foreground">
            Sign in to access your {type === 'admin' ? 'admin dashboard' : 'golf course data'}
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button 
              type="submit" 
              variant="teal" 
              size="lg" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
          
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-primary-teal hover:underline font-medium"
            >
              Forgot Password?
            </button>
          </div>
          
          {type === 'client' && (
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => window.location.href = '/signup'}
                  className="text-primary-teal hover:underline font-medium"
                >
                  Request Access
                </button>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}