import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Eye, EyeOff } from "lucide-react";
import phytoMapsLogo from "/assets/b377485b-420a-475e-81d5-4cb44b625614.png";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
interface LandingPageProps {
  onClientLogin: () => void;
  onAdminLogin: () => void;
  onForgotPassword?: () => void;
}
export const LandingPage = ({
  onClientLogin,
  onAdminLogin,
  onForgotPassword
}: LandingPageProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    signIn
  } = useAuth();
  const {
    toast
  } = useToast();
  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive"
        });
      } else {
        // Validation for client role and approval status
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('role, approved')
            .eq('id', user.id)
            .single();

          if (profile && profile.role !== 'client') {
            toast({
              title: "Access Denied",
              description: "Admin credentials cannot access the client portal.",
              variant: "destructive"
            });
            const { useAuth } = await import("@/hooks/useAuth");
            await supabase.auth.signOut();
            setIsLoading(false);
            return;
          }

          if (profile && !profile.approved) {
            toast({
              title: "Account Pending",
              description: "Your account is awaiting admin approval.",
            });
            await supabase.auth.signOut();
            setIsLoading(false);
            return;
          }
        }

        onClientLogin();
        toast({
          title: "Login Successful",
          description: "Welcome to PhytoMaps!"
        });
      }
    } catch (error) {
      toast({
        title: "Login Failed",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center p-6 relative">
    {/* Admin Access Button - Bottom Left */}
    <Button variant="ghost" size="sm" onClick={onAdminLogin} className="absolute bottom-6 left-6 text-white/60 hover:text-white hover:bg-white/10">
      Admin
    </Button>

    {/* Main Content - Responsive Layout */}
    <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
      {/* Logo Section - Top on mobile, Left on desktop */}
      <div className="flex-1 flex flex-col items-center justify-center order-1 lg:order-1">
        <div className="flex justify-center mb-4 lg:mb-6">
          <img src={phytoMapsLogo} alt="PhytoMaps Logo" className="h-32 w-32 lg:h-64 lg:w-64 object-contain bg-white rounded-full p-2 lg:p-4" />
        </div>
        <p className="text-base lg:text-lg font-medium text-zinc-50 text-center">
          Golf Course Mapping & Analysis Portal
        </p>
      </div>

      {/* Login Card - Bottom on mobile, Right on desktop */}
      <div className="flex-1 max-w-md w-full order-2 lg:order-2">
        <Card className="shadow-elegant hover:shadow-hover transition-spring">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-accent-teal/10 rounded-full">
                <Users className="h-6 w-6 text-accent-teal" />
              </div>
            </div>
            <CardTitle className="text-xl">Client Access</CardTitle>
            <p className="text-sm text-muted-foreground">
              Sign in to view your course data
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleClientLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </label>
                <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
                  <Button type="button" variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 h-auto p-1" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>

              <Button type="submit" variant="teal" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-4 text-center space-y-2">
              <button type="button" onClick={onForgotPassword} className="text-sm text-primary-teal hover:underline">
                Forgot Password?
              </button>

              <div className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button type="button" onClick={() => window.location.href = '/signup'} className="text-primary-teal hover:underline font-medium">
                  Request Access
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
};