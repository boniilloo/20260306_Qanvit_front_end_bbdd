import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, MessageSquare, ArrowRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePublicConversationsForSidebar } from '@/hooks/usePublicConversationsForSidebar';
import { formatDistanceToNow } from 'date-fns';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface ExampleConversationsCarouselProps {
  onStartYourOwn?: () => void;
}

interface ImageWithSkeletonProps {
  src: string | null;
  alt: string;
  className?: string;
}

const ImageWithSkeleton: React.FC<ImageWithSkeletonProps> = ({ src, alt, className = "" }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!src) {
      setImageError(true);
      return;
    }

    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageError(true);
    img.src = src;
  }, [src]);

  if (!src || imageError) {
    // Show default icon if no image or error
    return (
      <div className="w-10 h-10 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
      {!imageLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg"></div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </div>
  );
};

const ExampleConversationsCarousel: React.FC<ExampleConversationsCarouselProps> = ({ onStartYourOwn }) => {
  const { publicConversations, loading } = usePublicConversationsForSidebar(false, false);
  const navigate = useNavigate();

  const handleConversationClick = (conversationId: string) => {
    navigate(`/chat-example/${conversationId}`);
  };

  const handleRandomConversation = () => {
    if (publicConversations.length > 0) {
      const randomIndex = Math.floor(Math.random() * publicConversations.length);
      const randomConversation = publicConversations[randomIndex];
      navigate(`/chat-example/${randomConversation.conversation_id}`);
    }
  };


  // Show skeleton only if we don't have any conversations yet
  if (loading && publicConversations.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto mb-8">
        {/* Header Skeleton */}
        <div className="flex items-center gap-2 mb-4 px-2">
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse"></div>
          <div className="w-48 h-6 bg-gray-200 rounded animate-pulse"></div>
          <div className="w-16 h-5 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Carousel Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-full">
              <CardContent className="p-5 h-full flex flex-col">
                {/* Header Skeleton */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="w-16 h-5 bg-gray-200 rounded animate-pulse"></div>
                </div>

                {/* Title Skeleton */}
                <div className="w-full h-5 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="w-3/4 h-5 bg-gray-200 rounded animate-pulse mb-3"></div>

                {/* Preview Skeleton */}
                <div className="w-full h-4 bg-gray-200 rounded animate-pulse mb-1 flex-grow"></div>
                <div className="w-2/3 h-4 bg-gray-200 rounded animate-pulse mb-3"></div>

                {/* Footer Skeleton */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-20 h-3 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="w-12 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Action Buttons Skeleton */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <div className="w-40 h-10 bg-gray-200 rounded animate-pulse"></div>
          <div className="w-48 h-10 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (publicConversations.length === 0) {
    return null; // Don't show anything if no public conversations
  }

  return (
    <>
      {/* Mobile Version - Vertical Scrollable List */}
      <div className="block sm:hidden w-full px-4 mb-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-yellow-500" />
          <h2 className="text-base font-bold text-[#22183a]">Example Conversations</h2>
          <Badge variant="secondary" className="ml-1 text-xs">
            {publicConversations.length}
          </Badge>
        </div>

        {/* Scrollable List with Snap */}
        <div className="overflow-y-auto snap-y snap-mandatory max-h-[245px] -mx-4 px-4 space-y-3">
          {publicConversations.map((conversation) => (
            <div 
              key={conversation.conversation_id}
              className="snap-start"
            >
              <Card 
                className="cursor-pointer active:scale-[0.98] transition-all duration-200 border-2 active:border-[#f4a9aa]"
                onClick={() => handleConversationClick(conversation.conversation_id)}
              >
                <CardContent className="p-3 flex gap-3">
                  {/* Image on left */}
                  <div className="flex-shrink-0">
                    <ImageWithSkeleton
                      src={conversation.image_url}
                      alt={conversation.title || 'Example conversation'}
                    />
                  </div>
                  
                  {/* Content on right */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <h3 className="font-semibold text-sm text-[#22183a] mb-1 line-clamp-2">
                      {conversation.title || conversation.preview || 'Example Conversation'}
                    </h3>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{formatDistanceToNow(new Date(conversation.created_at), { addSuffix: false })}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[#f4a9aa] text-xs font-medium flex-shrink-0">
                        <span>View</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Action Button - Mobile */}
        <div className="mt-4">
          <Button
            onClick={onStartYourOwn}
            className="w-full bg-[#22183a] hover:bg-[#334155] text-white shadow-lg text-sm h-10"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Start Your Own Conversation
          </Button>
        </div>
      </div>

      {/* Desktop Version - Horizontal Carousel */}
      <div className="hidden sm:block w-full max-w-4xl mx-auto mb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            <h2 className="text-xl font-bold text-[#22183a]">Example Conversations</h2>
            <Badge variant="secondary" className="ml-2">
              {publicConversations.length} examples
            </Badge>
          </div>
        </div>

        {/* Carousel */}
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {publicConversations.map((conversation) => (
              <CarouselItem key={conversation.conversation_id} className="pl-2 md:pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
                <Card 
                  className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-2 hover:border-[#f4a9aa] h-full"
                  onClick={() => handleConversationClick(conversation.conversation_id)}
                >
                  <CardContent className="p-5 h-full flex flex-col">
                    {/* Header with small image/icon and badges */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ImageWithSkeleton
                          src={conversation.image_url}
                          alt={conversation.title || 'Example conversation'}
                        />
                      </div>
                      <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                        Example
                      </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-[#22183a] mb-2 line-clamp-2 flex-shrink-0">
                      {conversation.title || conversation.preview || 'Example Conversation'}
                    </h3>

                    {/* Preview */}
                    {conversation.preview && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2 flex-grow">
                        {conversation.preview}
                      </p>
                    )}

                    {/* Footer with time and view action */}
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true })}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[#f4a9aa] text-sm font-medium">
                        <span>View</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex -left-12" />
          <CarouselNext className="hidden md:flex -right-12" />
        </Carousel>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <Button
            onClick={handleRandomConversation}
            variant="outline"
            className="w-full sm:w-auto border-2 border-[#f4a9aa] text-[#f4a9aa] hover:bg-[#f4a9aa] hover:text-white transition-all duration-300"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Get Random Example
          </Button>
          
          <Button
            onClick={onStartYourOwn}
            className="w-full sm:w-auto bg-[#22183a] hover:bg-[#334155] text-white shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Start Your Own Conversation
          </Button>
        </div>
      </div>
    </>
  );
};

export default ExampleConversationsCarousel;

