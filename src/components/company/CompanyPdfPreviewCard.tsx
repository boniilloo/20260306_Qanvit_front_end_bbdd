import React from 'react';
import { FileText, Download, Trash2, Loader2, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompanyDocumentPreview } from '@/hooks/useCompanyDocumentPreview';

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

interface CompanyPdfPreviewCardProps {
  document: CompanyDocument;
  onDownload: (doc: CompanyDocument) => void;
  onDelete: (doc: CompanyDocument) => void;
  formatFileSize: (bytes: number) => string;
}

export const CompanyPdfPreviewCard: React.FC<CompanyPdfPreviewCardProps> = ({
  document: doc,
  onDownload,
  onDelete,
  formatFileSize
}) => {
  
  const { imageUrl, isLoading, error } = useCompanyDocumentPreview(doc.file_path, doc.mime_type);
  
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
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={imageUrl}
              alt={`Preview of ${doc.file_name}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}
        
        {(!imageUrl || error || doc.mime_type !== 'application/pdf') && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-muted">
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
        
        {/* Clickable overlay for download */}
        <div 
          className="absolute inset-0 cursor-pointer bg-black/0 hover:bg-black/10 transition-colors" 
          onClick={() => onDownload(doc)} 
          title="Click to download document"
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
            {onDelete !== (() => {}) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(doc)}
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};