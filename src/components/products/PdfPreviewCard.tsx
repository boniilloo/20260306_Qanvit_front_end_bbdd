import React from 'react';
import { FileText, Download, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePdfPreview } from '@/hooks/usePdfPreview';

interface ProductDocument {
  id: string;
  product_id: string;
  product_revision_id: string | null;
  file_name: string;
  file_path: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
  source: string;
}

interface PdfPreviewCardProps {
  document: ProductDocument;
  onDownload: (doc: ProductDocument) => void;
  onDelete: (doc: ProductDocument) => void;
  formatFileSize: (bytes: number) => string;
}

export const PdfPreviewCard: React.FC<PdfPreviewCardProps> = ({
  document: doc,
  onDownload,
  onDelete,
  formatFileSize
}) => {
  
  const { imageUrl, isLoading, error } = usePdfPreview(doc.file_path);
  
  

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* PDF Preview */}
      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {imageUrl && !isLoading && (
          <img
            src={imageUrl}
            alt={`Preview of ${doc.file_name}`}
            className="w-full h-full object-cover"
          />
        )}
        
        {error && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-muted">
            <div className="bg-muted-foreground rounded-lg p-3 mb-3 shadow-lg">
              <FileText className="h-8 w-8 text-muted" />
            </div>
            <h4 className="font-semibold text-sm mb-1 line-clamp-2 text-foreground">
              {doc.file_name}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {formatFileSize(doc.file_size)}
            </p>
            <p className="text-xs text-muted-foreground">
              Preview unavailable
            </p>
          </div>
        )}
        
        {/* Clickable overlay for download */}
        <div 
          className="absolute inset-0 cursor-pointer bg-black/0 hover:bg-black/10 transition-colors" 
          onClick={() => onDownload(doc)} 
          title="Click to download PDF"
        />
      </div>
      
      {/* Document Info */}
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" title={doc.file_name}>
              {doc.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(doc.file_size)} • {doc.source === 'auto_fill' ? 'Auto-filled' : 'Manual upload'}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDownload(doc)}
              className="h-8 w-8 p-0"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(doc)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};