
import React from 'react';

interface SectionBoxProps {
  title: string;
  children: React.ReactNode;
  gradient?: boolean;
}

const SectionBox = ({ title, children, gradient = false }: SectionBoxProps) => {
  return (
    <div className="bg-white rounded-xl border border-sky/20 shadow-sm overflow-hidden mb-10 px-6 lg:px-10">
      <div className={`
        px-6 py-4 border-b border-sky/10
        ${gradient ? 'bg-gradient-to-r from-sky/5 to-mint/5' : 'bg-sky/5'}
      `}>
        <h2 className="text-xl font-bold text-navy tracking-wide">
          {title}
        </h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
};

export default SectionBox;
