import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownTextProps {
  children: string;
  className?: string;
}

/**
 * Component to render Markdown text with proper formatting.
 * Supports GitHub Flavored Markdown (GFM) for tables, strikethrough, etc.
 */
const MarkdownText: React.FC<MarkdownTextProps> = ({ children, className = '' }) => {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Style paragraphs
        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
        
        // Style strong/bold text
        strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
        
        // Style emphasis/italic text
        em: ({ node, ...props }) => <em className="italic" {...props} />,
        
        // Style links
        a: ({ node, ...props }) => (
          <a
            className="text-[#80c8f0] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        
        // Style lists
        ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
        li: ({ node, ...props }) => <li className="text-sm" {...props} />,
        
        // Style code
        code: ({ node, inline, ...props }: any) => {
          return inline ? (
            <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" {...props} />
          ) : (
            <code className="block bg-gray-100 p-2 rounded text-sm font-mono overflow-x-auto" {...props} />
          );
        },
        
        // Style blockquotes
        blockquote: ({ node, ...props }) => (
          <blockquote className="border-l-4 border-[#80c8f0] pl-4 italic my-2" {...props} />
        ),
        
        // Style headings
        h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-2 mt-4" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-2 mt-3" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-base font-bold mb-2 mt-2" {...props} />,
        h4: ({ node, ...props }) => <h4 className="text-sm font-bold mb-1 mt-2" {...props} />,
        
        // Style tables
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse border border-gray-300" {...props} />
          </div>
        ),
        thead: ({ node, ...props }) => <thead className="bg-gray-100" {...props} />,
        th: ({ node, ...props }) => (
          <th className="border border-gray-300 px-2 py-1 text-left text-sm font-semibold" {...props} />
        ),
        td: ({ node, ...props }) => (
          <td className="border border-gray-300 px-2 py-1 text-sm" {...props} />
        ),
      }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownText;

