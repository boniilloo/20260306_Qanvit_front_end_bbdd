import React, { useState, useEffect } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { MessageDocument } from '@/types/chat';

interface DocumentPreviewModalProps {
  document: MessageDocument;
  isOpen: boolean;
  onClose: () => void;
}

export default function DocumentPreviewModal({ document, isOpen, onClose }: DocumentPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      window.document.body.style.overflow = 'hidden';
    } else {
      window.document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      window.document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleDownload = () => {
    const link = window.document.createElement('a');
    link.href = document.url;
    link.download = document.filename;
    link.target = '_blank';
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const isPdf = document.metadata.format === 'application/pdf';

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center p-4" 
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="relative max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center">
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black rounded-full p-2 transition-colors shadow-lg"
          style={{ zIndex: 10000 }}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Download Button */}
        <button 
          onClick={handleDownload} 
          className="absolute top-4 right-16 bg-white/90 hover:bg-white text-black rounded-full p-2 transition-colors shadow-lg"
          style={{ zIndex: 10000 }}
          title="Download document"
        >
          <Download className="w-6 h-6" />
        </button>

        {/* Document Viewer */}
        <div className="w-full h-full rounded-lg bg-white shadow-2xl overflow-hidden">
          {isPdf ? (
            <iframe
              src={document.url}
              className="w-full h-full border-0"
              title={`View ${document.filename}`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8">
              <div className="text-center">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {document.filename}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Preview not available for this file type
                </p>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
