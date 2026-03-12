import React from 'react';
import { Sparkles } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

interface ExampleConversationSkeletonProps {
  loadingStep: string;
}

const ExampleConversationSkeleton: React.FC<ExampleConversationSkeletonProps> = ({ loadingStep }) => {
  const { state: sidebarState } = useSidebar();
  const isMobile = useIsMobile();

  return (
    <div className="flex-1 bg-fqgrey-100 min-h-screen flex flex-col">
      {/* Header Skeleton */}
      <div 
        className="fixed top-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-b border-gray-200/50 p-4"
        style={{
          left: isMobile ? 0 : sidebarState === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)',
        }}
      >
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <div className="flex flex-col space-y-1">
                <div className="h-5 w-48 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-6 w-20 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-[#22183a] mb-2">Loading example conversation...</div>
          <div className="text-sm text-gray-600 mb-4">{loadingStep}</div>
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
        </div>
      </div>

      {/* Footer Skeleton */}
      <div 
        className="fixed bottom-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4"
        style={{
          left: isMobile ? 0 : sidebarState === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)',
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mx-auto"></div>
        </div>
      </div>
    </div>
  );
};

export default ExampleConversationSkeleton;
