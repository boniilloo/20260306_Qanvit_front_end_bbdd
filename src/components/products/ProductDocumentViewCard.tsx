import React, { useState, useEffect } from 'react';
import { FileText, Download, Loader2, File, X, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePdfPreview } from '@/hooks/usePdfPreview';
import { usePdfPreviewFromUrl } from '@/hooks/usePdfPreviewFromUrl';
import { supabase } from '@/integrations/supabase/client';

interface ProductDocument {
  id: string;
  product_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  source: string;
  created_at: string;
  uploaded_by: string | null;
  product_revision_id: string | null;
  is_scraped?: boolean;
  external_url?: string;
}

interface ProductDocumentViewCardProps {
  document: ProductDocument;
  onDownload: (doc: ProductDocument) => void;
  formatFileSize: (bytes: number) => string;
}

export const ProductDocumentViewCard: React.FC<ProductDocumentViewCardProps> = ({
  document: doc,
  onDownload,
  formatFileSize
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // Determine if this is an external PDF
  const isExternalPdf = doc.is_scraped && doc.external_url;
  
  // Use different hooks based on whether it's a scraped external URL or storage file
  // Pass empty/null values to prevent unnecessary hook execution
  const storagePreview = usePdfPreview(!isExternalPdf && doc.file_path ? doc.file_path : '');
  const urlPreview = usePdfPreviewFromUrl(isExternalPdf ? doc.external_url! : null);
  
  // Select the appropriate preview data
  const { imageUrl, isLoading, error } = isExternalPdf ? urlPreview : storagePreview;
  
  // Handle opening PDF in modal or new tab
  const handlePreviewClick = async () => {
    try {
      if (isExternalPdf) {
        // For external PDFs, open in a new tab
        window.open(doc.external_url!, '_blank', 'noopener,noreferrer');
      } else {
        // For storage PDFs, get a signed URL and open in modal
        const { data } = await supabase.storage
          .from('product-documents')
          .createSignedUrl(doc.file_path, 3600); // 1 hour expiry
        
        if (data?.signedUrl) {
          setPdfUrl(data.signedUrl);
          setIsModalOpen(true);
        }
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
  
  const getFileIcon = () => {
    return <FileText className="h-8 w-8 text-red-500" />;
  };

  return (
    <div className="border rounded-lg overflow-hidden w-56">
      {/* Document Preview */}
      <div className="aspect-[3/4] bg-muted relative overflow-hidden h-48 flex items-center justify-center mx-auto">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {imageUrl && !isLoading && (
          <div 
            className="w-full h-full relative group cursor-pointer"
            onClick={handlePreviewClick}
            title={isExternalPdf ? "Click to open in new tab" : "Click to open"}
          >
            <img
              src={imageUrl}
              alt={`Preview of ${doc.file_name}`}
              className="max-w-full max-h-full object-contain mx-auto"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                {isExternalPdf ? "Open in new tab" : "Click to open"}
              </span>
            </div>
          </div>
        )}
        
        {(!imageUrl || error) && !isLoading && (
          <div 
            className={`absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-muted cursor-pointer hover:bg-muted/80 transition-colors`}
            onClick={handlePreviewClick}
            title={isExternalPdf ? "Click to open in new tab" : "Click to open"}
          >
            <div className="bg-muted-foreground rounded-lg p-2 mb-2 shadow-lg">
              {getFileIcon()}
            </div>
            <h4 className="font-semibold text-sm mb-1 line-clamp-2 text-foreground">
              {doc.file_name}
            </h4>
            <p className="text-xs text-muted-foreground mb-1">
              {formatFileSize(doc.file_size)}
            </p>
            {error && (
              <p className="text-xs text-muted-foreground">
                {isExternalPdf ? "Click to open" : "Preview unavailable"}
              </p>
            )}
          </div>
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
            {doc.is_scraped && (
              <Badge 
                variant="secondary" 
                className="mt-1 text-xs flex items-center gap-1 w-fit"
              >
                <Bot className="h-3 w-3" />
                Auto-scraped
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {!doc.is_scraped && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDownload(doc)}
                className="h-7 w-7 p-0"
              >
                <Download className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* PDF Modal */}
      {isModalOpen && pdfUrl && (
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