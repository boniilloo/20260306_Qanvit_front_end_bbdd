
import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
  asChild?: boolean;
}

const AccessibleButton = React.forwardRef<HTMLButtonElement, AccessibleButtonProps>(({ 
  variant = 'primary', 
  size = 'md', 
  loading = false,
  className,
  children,
  disabled,
  asChild = false,
  ...props 
}, ref) => {
  const baseClasses = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#80c8f0] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";
  
  const variants = {
    primary: "bg-gradient-to-r from-[#80c8f0] to-[#7de19a] text-white hover:shadow-lg hover:shadow-[#80c8f0]/25 hover:-translate-y-0.5",
    secondary: "bg-[#1b2c4a] text-white hover:bg-[#2d3748] hover:shadow-lg hover:-translate-y-0.5",
    outline: "border-2 border-[#80c8f0] text-[#80c8f0] bg-white hover:bg-[#80c8f0] hover:text-white hover:shadow-lg hover:-translate-y-0.5",
    ghost: "text-[#1b2c4a] hover:bg-gray-100 hover:text-[#80c8f0]"
  };
  
  const sizes = {
    sm: "px-3 py-2 text-sm min-h-[36px] min-w-[36px]",
    md: "px-4 py-3 text-sm min-h-[44px] min-w-[44px]",
    lg: "px-6 py-4 text-base min-h-[48px] min-w-[48px]"
  };

  if (asChild) {
    return React.cloneElement(children as React.ReactElement, {
      className: cn(
        baseClasses,
        variants[variant],
        sizes[size],
        className
      ),
      ref,
      ...props
    });
  }

  return (
    <button
      ref={ref}
      className={cn(
        baseClasses,
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
});

AccessibleButton.displayName = "AccessibleButton";

export default AccessibleButton;
