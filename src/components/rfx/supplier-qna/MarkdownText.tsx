import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownTextProps {
  children: string;
  className?: string;
}

const MarkdownText: React.FC<MarkdownTextProps> = ({ children, className }) => {
  return (
    <div className={`prose prose-sm max-w-none text-inherit ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
};

export default MarkdownText;
