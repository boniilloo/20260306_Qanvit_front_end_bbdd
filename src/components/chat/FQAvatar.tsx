
import React from 'react';

interface FQAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  isThinking?: boolean;
}

const FQAvatar = ({ size = 'md', className = '', isThinking = false }: FQAvatarProps) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  const logoSizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  return (
    <div className={`
      ${sizeClasses[size]} 
      flex items-center justify-center 
      flex-shrink-0
      ${className}
    `}>
      <img 
        src="/lovable-uploads/595aa055-b6f4-48f7-875d-e880cb4a7d97.png" 
        alt="FQ Source" 
        className={`${logoSizeClasses[size]} object-contain ${isThinking ? 'animate-bounce' : ''}`}
        style={isThinking ? { 
          animationDuration: '2s',
          animationTimingFunction: 'ease-in-out'
        } : undefined}
      />
    </div>
  );
};

export default FQAvatar;
