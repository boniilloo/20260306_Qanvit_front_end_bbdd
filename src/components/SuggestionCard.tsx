
import React from 'react';

interface SuggestionCardProps {
  text: string;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ text }) => {
  return (
    <div className="suggestion-card min-w-[240px] h-[80px] bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center cursor-pointer">
      <p className="text-sm text-gray-600 line-clamp-3">{text}</p>
    </div>
  );
};

export default SuggestionCard;
