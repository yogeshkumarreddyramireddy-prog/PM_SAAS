import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import phytoMapsLogo from "/assets/b377485b-420a-475e-81d5-4cb44b625614.png"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"

interface ForgotPasswordFormProps {
  onBack: () => void
}

export const ForgotPasswordForm = ({ onBack }: ForgotPasswordFormProps) => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const { resetPassword } = useAuth()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      const { error } = await resetPassword(email)
      
      if (error) {
        toast({
          title: "Reset Failed",
          description: error.message,
          variant: "destructive"
        })
      } else {
        setIsSubmitted(true)
        toast({
          title: "Reset Email Sent",
          description: "Check your email for reset instructions",
        })
      }
    } catch (error) {
      toast({
        title: "Reset Failed",
        description: "An unexpected error occurred",
        variant: "destructive"
      })
    } finally {
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
            Reset Password
          </CardTitle>
          <p className="text-muted-foreground">
            Enter your email to receive reset instructions
          </p>
        </CardHeader>
        
        <CardContent>
          {!isSubmitted ? (
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

              <Button 
                type="submit" 
                variant="teal" 
                size="lg" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Password reset instructions have been sent to <strong>{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Please check your inbox and follow the instructions to reset your password.
              </p>
            </div>
          )}
          
          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex items-center gap-2 mx-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}