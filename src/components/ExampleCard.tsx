import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface ExampleCardProps {
  title: string;
  description?: string;
  imageUrl?: string;
  fallbackIcon: React.ReactNode;
  fallbackGradient: string;
  createdAt: Date;
  badge?: {
    label: string;
    variant?: 'default' | 'outline';
    className?: string;
  };
  onClick: () => void;
}

const ExampleCard: React.FC<ExampleCardProps> = ({
  title,
  description,
  imageUrl,
  fallbackIcon,
  fallbackGradient,
  createdAt,
  badge,
  onClick,
}) => {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-2 hover:border-[#f4a9aa] h-full"
      onClick={onClick}
    >
      <CardContent className="p-4 h-full flex flex-col">
        <div className="flex items-start justify-between mb-2 min-h-[40px]">
          <div className="flex items-center gap-2">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className={`w-10 h-10 ${fallbackGradient} rounded-lg flex items-center justify-center flex-shrink-0`}>
                {fallbackIcon}
              </div>
            )}
          </div>
          {badge && (
            <Badge variant={badge.variant} className={badge.className}>
              {badge.label}
            </Badge>
          )}
        </div>

        <h3 className="font-semibold text-[#22183a] mb-2 line-clamp-2 text-sm flex-shrink-0">
          {title}
        </h3>

        {description && (
          <p className="text-xs text-gray-600 mb-2 line-clamp-2 flex-grow">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>
              {formatDistanceToNow(createdAt, { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[#f4a9aa] text-xs font-medium">
            <span>View</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExampleCard;











