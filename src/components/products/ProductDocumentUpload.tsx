import React, { useState, useEffect } from 'react';
import { Upload, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PdfPreviewCard } from './PdfPreviewCard';

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

interface ProductDocumentUploadProps {
  productId: string;
  onDocumentsChange?: (documents: ProductDocument[]) => void;
  onSaveProductIfNeeded?: () => Promise<string>;
}

export const ProductDocumentUpload: React.FC<ProductDocumentUploadProps> = ({
  productId,
  onDocumentsChange,
  onSaveProductIfNeeded
}) => {
  const [documents, setDocuments] = useState<ProductDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();

  // Helper function to validate UUID
  const isValidUUID = (id: string): boolean => {
    if (!id || typeof id !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  useEffect(() => {
    // Only load documents if productId is valid
    if (isValidUUID(productId)) {
      loadDocuments();
    }
  }, [productId]);

  const loadDocuments = async () => {
    
    if (!productId || !isValidUUID(productId)) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('product_documents')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      
      setDocuments(data as ProductDocument[] || []);
      onDocumentsChange?.(data as ProductDocument[] || []);
    } catch (error) {
      console.error('❌ Error loading documents:', error);
      toast({ title: "Error loading documents", variant: "destructive" });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);

      // Validate file type
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are allowed');
      }

      // Check document limit (max 3 files)
      if (documents.length >= 3) {
        throw new Error('You can only upload a maximum of 3 PDF documents per product');
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size must be less than 10MB');
      }

      // Ensure product is saved before uploading
      let actualProductId = productId;
      if (!productId && onSaveProductIfNeeded) {
        actualProductId = await onSaveProductIfNeeded();
      }

      if (!actualProductId) {
        throw new Error('Product must be saved before uploading documents');
      }

      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${actualProductId}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('product-documents')
        .upload(filePath, file);

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        throw uploadError;
      }

      // Save document record
      const { error: dbError } = await supabase
        .from('product_documents')
        .insert({
          product_id: actualProductId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          source: 'manual_upload',
          uploaded_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (dbError) throw dbError;

      await loadDocuments();

      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload document',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDocument = async (document: ProductDocument) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('product-documents')
        .remove([document.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('product_documents')
        .delete()
        .eq('id', document.id);

      if (dbError) throw dbError;

      await loadDocuments();

      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const downloadDocument = async (document: ProductDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('product-documents')
        .download(document.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.file_name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to download document',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(uploadFile);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">
          PDF Documents ({documents.length}/3)
        </label>
      </div>

      {!isValidUUID(productId) ? (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-muted-foreground/25 rounded-lg">
          <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">
            Save the product first to upload PDF documents
          </p>
        </div>
      ) : (
        <>
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag PDF files here or click to select
            </p>
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="pdf-upload-page"
              disabled={isUploading || documents.length >= 3}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading || documents.length >= 3}
              onClick={() => document.getElementById('pdf-upload-page')?.click()}
            >
              {isUploading ? 'Uploading...' : 'Select Files'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Maximum 3 documents • 10MB per file • PDF format only
            </p>
          </div>

          {/* Documents Grid with Preview */}
          {documents.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Uploaded Documents:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((doc) => (
                  <PdfPreviewCard
                    key={doc.id}
                    document={doc}
                    onDownload={downloadDocument}
                    onDelete={deleteDocument}
                    formatFileSize={formatFileSize}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};