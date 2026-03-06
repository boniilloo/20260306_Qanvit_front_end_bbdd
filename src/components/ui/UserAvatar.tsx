import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  surname?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-20 w-20 text-lg',
  xl: 'h-32 w-32 text-2xl'
};

export const UserAvatar: React.FC<UserAvatarProps> = ({ 
  src, 
  name, 
  surname, 
  size = 'md', 
  className 
}) => {
  const getInitials = () => {
    const firstInitial = name?.charAt(0)?.toUpperCase() || '';
    const lastInitial = surname?.charAt(0)?.toUpperCase() || '';
    return `${firstInitial}${lastInitial}` || '?';
  };

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {src && (
        <AvatarImage 
          src={src} 
          alt={`${name} ${surname}`.trim() || 'User avatar'}
        />
      )}
      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
        {getInitials()}
      </AvatarFallback>
    </Avatar>
  );
};