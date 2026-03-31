import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import phytoMapsLogo from "/assets/b377485b-420a-475e-81d5-4cb44b625614.png"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"

interface SignupFormProps {
  onBack: () => void
}

export const SignupForm = ({ onBack }: SignupFormProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [golfCourseName, setGolfCourseName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  
  const { signUp } = useAuth()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    if (!golfCourseName.trim()) {
      toast({
        title: "Please enter a golf course name",
        variant: "destructive"
      })
      setIsLoading(false)
      return
    }

    try {
      const { error } = await signUp(email, password, firstName, lastName, golfCourseName)
      
      if (error) {
        toast({
          title: "Signup Failed",
          description: error.message,
          variant: "destructive"
        })
      } else {
        setIsSubmitted(true)
        toast({
          title: "Account Created",
          description: "Your account has been created and is pending approval. You'll receive an email once approved.",
        })
      }
    } catch (error) {
      toast({
        title: "Signup Failed",
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
            Request Access
          </CardTitle>
          <p className="text-muted-foreground">
            Create an account to access your golf course data
          </p>
        </CardHeader>
        
        <CardContent>
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="firstName" className="text-sm font-medium">
                    First Name
                  </label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="Enter first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm font-medium">
                    Last Name
                  </label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Enter last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

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
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="golfCourse" className="text-sm font-medium">
                  Golf Course Name
                </label>
                <Input
                  id="golfCourse"
                  type="text"
                  placeholder="Enter your golf course name"
                  value={golfCourseName}
                  onChange={(e) => setGolfCourseName(e.target.value)}
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
                {isLoading ? 'Creating Account...' : 'Request Access'}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Your account request has been submitted for <strong>{golfCourseName}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                An administrator will review your request and you'll receive an email once your account is approved.
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