import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const StarRating = ({ 
  rating, 
  onRatingChange, 
  disabled = false, 
  size = 'md',
  className 
}: StarRatingProps) => {
  const [hoverRating, setHoverRating] = useState(0);

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  };

  const handleClick = (selectedRating: number) => {
    if (!disabled && onRatingChange) {
      onRatingChange(selectedRating);
    }
  };

  const handleMouseEnter = (selectedRating: number) => {
    if (!disabled) {
      setHoverRating(selectedRating);
    }
  };

  const handleMouseLeave = () => {
    if (!disabled) {
      setHoverRating(0);
    }
  };

  return (
    <div className={cn("flex gap-1", className)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isActive = star <= (hoverRating || rating);
        return (
          <Star
            key={star}
            className={cn(
              sizeClasses[size],
              "transition-colors duration-200",
              !disabled && "cursor-pointer",
              disabled && "cursor-default",
              isActive 
                ? "fill-yellow-400 text-yellow-400" 
                : "fill-transparent text-muted-foreground hover:text-yellow-400"
            )}
            onClick={() => handleClick(star)}
            onMouseEnter={() => handleMouseEnter(star)}
            onMouseLeave={handleMouseLeave}
          />
        );
      })}
    </div>
  );
};

export default StarRating;