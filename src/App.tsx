import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import { PMVApp } from "./pages/PMVApp";
import ResetPassword from "./pages/ResetPassword";
import { AuthProvider } from "@/hooks/useAuth";
import { UploadProvider } from "@/contexts/UploadContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UploadProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PMVApp />} />
            <Route path="/admin" element={<PMVApp />} />
            <Route path="/signup" element={<PMVApp />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </UploadProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
