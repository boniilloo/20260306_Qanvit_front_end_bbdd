import React, { useState, useEffect } from 'react';
import { FileText, Download, Loader2, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompanyDocumentPreview } from '@/hooks/useCompanyDocumentPreview';
import { supabase } from '@/integrations/supabase/client';

interface CompanyDocument {
  id: string;
  company_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
}

interface CompanyDocumentViewCardProps {
  document: CompanyDocument;
  onDownload: (doc: CompanyDocument) => void;
  formatFileSize: (bytes: number) => string;
}

export const CompanyDocumentViewCard: React.FC<CompanyDocumentViewCardProps> = ({
  document: doc,
  onDownload,
  formatFileSize
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  const { imageUrl, isLoading, error } = useCompanyDocumentPreview(doc.file_path, doc.mime_type);
  
  // Handle opening PDF in modal
  const handlePreviewClick = async () => {
    if (doc.mime_type !== 'application/pdf') return;
    
    try {
      const { data } = await supabase.storage
        .from('company-documents')
        .createSignedUrl(doc.file_path, 3600); // 1 hour expiry
      
      if (data?.signedUrl) {
        setPdfUrl(data.signedUrl);
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error('Error getting PDF URL:', error);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);
  
  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') {
      return <FileText className="h-8 w-8 text-red-500" />;
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
      return <FileText className="h-8 w-8 text-blue-500" />;
    } else {
      return <File className="h-8 w-8 text-gray-500" />;
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden w-full">
      {/* Document Preview */}
      <div className="aspect-[3/4] bg-muted relative overflow-hidden h-48 flex items-center justify-center mx-auto">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {imageUrl && !isLoading && doc.mime_type === 'application/pdf' && (
          <div 
            className="w-full h-full relative group cursor-pointer"
            onClick={handlePreviewClick}
            title="Click to open"
          >
            <img
              src={imageUrl}
              alt={`Preview of ${doc.file_name}`}
              className="max-w-full max-h-full object-contain mx-auto"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Click to open
              </span>
            </div>
          </div>
        )}
        
        {(!imageUrl || error || doc.mime_type !== 'application/pdf') && !isLoading && (
          <div 
            className={`absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-muted ${
              doc.mime_type === 'application/pdf' ? 'cursor-pointer hover:bg-muted/80 transition-colors' : ''
            }`}
            onClick={doc.mime_type === 'application/pdf' ? handlePreviewClick : undefined}
          >
            <div className="bg-muted-foreground rounded-lg p-2 mb-2 shadow-lg">
              {getFileIcon(doc.mime_type)}
            </div>
            <h4 className="font-semibold text-sm mb-1 line-clamp-2 text-foreground">
              {doc.file_name}
            </h4>
            <p className="text-xs text-muted-foreground mb-1">
              {formatFileSize(doc.file_size)}
            </p>
            {doc.mime_type !== 'application/pdf' && (
              <p className="text-xs text-muted-foreground">
                {doc.mime_type.includes('word') ? 'Word Document' : 'Document'}
              </p>
            )}
            {doc.mime_type === 'application/pdf' && error && (
              <p className="text-xs text-muted-foreground">
                Preview unavailable
              </p>
            )}
          </div>
        )}
        
        {/* Clickable overlay for download - only show for non-PDF or when no preview */}
        {(doc.mime_type !== 'application/pdf' || (!imageUrl && !isLoading)) && (
          <div 
            className="absolute inset-0 cursor-pointer bg-black/0 hover:bg-black/10 transition-colors" 
            onClick={() => onDownload(doc)} 
            title="Click to download document"
          />
        )}
      </div>
      
      {/* Document Info */}
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" title={doc.file_name}>
              {doc.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(doc.file_size)}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDownload(doc)}
              className="h-7 w-7 p-0"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* PDF Modal */}
      {isModalOpen && pdfUrl && doc.mime_type === 'application/pdf' && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-4" 
          style={{ zIndex: 9999 }}
          onClick={closeModal}
        >
          <div className="relative max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center">
            {/* Close Button */}
            <button 
              onClick={closeModal} 
              className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black rounded-full p-2 transition-colors shadow-lg"
              style={{ zIndex: 10000 }}
            >
              <X className="w-6 h-6" />
            </button>

            {/* PDF Viewer */}
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded-lg bg-white shadow-2xl"
              title={`View ${doc.file_name}`}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};