import React from 'react';
import * as Diff from 'diff';

interface DiffViewProps {
  oldText: string;
  newText: string;
  className?: string;
}

const DiffView: React.FC<DiffViewProps> = ({ oldText, newText, className = '' }) => {
  // Ensure both values are strings
  const safeOldText = String(oldText || '');
  const safeNewText = String(newText || '');
  const diff = Diff.diffWords(safeOldText, safeNewText);

  return (
    <div className={`text-sm font-mono whitespace-pre-wrap break-words ${className}`}>
      {diff.map((part, index) => {
        if (part.added) {
          return (
            <span key={index} className="bg-green-100 text-green-800 px-0.5">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={index} className="bg-red-100 text-red-800 line-through px-0.5">
              {part.value}
            </span>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </div>
  );
};

export default DiffView;

