import React from 'react';
import { SidebarProvider, SidebarTrigger, useSidebar } from './ui/sidebar';
import Sidebar from './Sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNavigation } from '@/contexts/NavigationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { closeWebSocket } from '@/services/chatService';

interface LayoutProps {
  children: React.ReactNode;
}

const MobileHeader: React.FC = () => {
  const { toggleSidebar } = useSidebar();
  const { user } = useAuth();
  const { userProfile, companyName } = useUserProfile();
  const { navigateWithConfirmation } = useNavigation();
  const location = useLocation();

  const handleLogoClick = () => {
    // Close WebSocket connection when navigating to home
    closeWebSocket();
    navigateWithConfirmation('/');
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({
        scope: 'global'
      });
      toast({
        title: "Logged out",
        description: "You have been successfully logged out."
      });
      navigateWithConfirmation('/auth');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Get page title based on current location
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Agent';
    if (path.startsWith('/chat/')) return 'Chat';
    if (path === '/supplier-search') return 'Supplier Search';
    if (path === '/discover') return 'Discover';
    if (path === '/rfxs') return 'RFX Projects';
    if (path === '/saved-suppliers') return 'Saved Suppliers';
    if (path === '/add-company') return 'Add Company';
    if (path === '/settings') return 'Settings';
    if (path === '/database-manager') return 'Database Manager';
    if (path === '/conversations') return 'Conversations';
    if (path === '/embedding-analytics') return 'Analytics';
    if (path === '/user-profile') return 'Profile';
    return 'Qanvit';
  };

  return (
    <header className="mobile-header fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40 lg:hidden shadow-sm">
      {/* Left side - Menu button and logo */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="mobile-touch-target text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg p-2" />
        <button 
          onClick={handleLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="bg-white p-1.5 rounded-md">
            <img 
              src="/branding/ISOTIPO_2-02.png" 
              alt="Qanvit Logo" 
              className="w-5 h-5 object-contain" 
            />
          </div>
          <span className="text-lg font-semibold text-[#22183a]">Qanvit</span>
        </button>
      </div>

      {/* Center - Page title */}
      <div className="flex-1 text-center">
        <h1 className="text-sm font-extrabold text-gray-900 truncate max-w-[200px] mx-auto">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right side - User menu */}
      <div className="flex items-center">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={userProfile?.avatar_url || ''} />
                  <AvatarFallback className="bg-[#f4a9aa] text-[#22183a] text-sm font-semibold">
                    {userProfile?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mobile-dropdown w-56">
              <DropdownMenuItem onClick={() => navigateWithConfirmation('/user-profile')} className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Configure Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigateWithConfirmation('/auth')}
            className="mobile-touch-target text-gray-600 hover:text-gray-900 rounded-lg p-2"
          >
            <User className="w-4 h-4" />
          </Button>
        )}
      </div>
    </header>
  );
};

const MainContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isMobile = useIsMobile();

  return (
    <div
      className={`flex-1 min-h-screen bg-background transition-all duration-300 ease-in-out ${
        isMobile ? 'pt-14' : 'pt-0'
      }`}
    >
      {children}
    </div>
  );
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        {/* Mobile header */}
        <MobileHeader />

        <Sidebar />
        
        {/* Main content that automatically adjusts */}
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  );
};

export default Layout;