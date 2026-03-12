
import React from 'react';
import { cn } from '@/lib/utils';

interface EnhancedCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const EnhancedCard = ({ 
  children, 
  className,
  hover = true,
  clickable = false,
  onClick,
  style
}: EnhancedCardProps) => {
  const baseClasses = "bg-white rounded-2xl shadow-sm border border-gray-200 transition-all duration-300";
  
  const interactiveClasses = hover ? [
    "hover:shadow-xl",
    "hover:shadow-gray-200/50",
    "hover:-translate-y-1",
    "hover:border-[#f4a9aa]/30"
  ].join(" ") : "";
  
  const clickableClasses = clickable ? [
    "cursor-pointer",
    "active:scale-[0.98]",
    "focus:outline-none",
    "focus:ring-2",
    "focus:ring-[#f4a9aa]/50",
    "focus:ring-offset-2"
  ].join(" ") : "";

  const Component = clickable ? 'button' : 'div';

  return (
    <Component
      className={cn(
        baseClasses,
        interactiveClasses,
        clickableClasses,
        className
      )}
      onClick={onClick}
      style={style}
      {...(clickable && { role: 'button', tabIndex: 0 })}
    >
      {children}
    </Component>
  );
};

export default EnhancedCard;
