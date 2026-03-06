import React, { useState, useEffect } from 'react';
import { Upload, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CompanyPdfPreviewCard } from './CompanyPdfPreviewCard';

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

interface CompanyDocumentUploadProps {
  companyId: string;
  onDocumentsChange?: (documents: CompanyDocument[]) => void;
}

export const CompanyDocumentUpload: React.FC<CompanyDocumentUploadProps> = ({
  companyId,
  onDocumentsChange
}) => {
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
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
    if (isValidUUID(companyId)) {
      loadDocuments();
    }
  }, [companyId]);

  const loadDocuments = async () => {
    
    if (!companyId || !isValidUUID(companyId)) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setDocuments(data as CompanyDocument[] || []);
      onDocumentsChange?.(data as CompanyDocument[] || []);
    } catch (error) {
      console.error('❌ Error loading company documents:', error);
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

      // Validate file type (PDFs and common office formats)
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessing',
        'text/plain'
      ];
      
      if (!allowedTypes.some(type => file.type.includes(type))) {
        throw new Error('Only PDF, DOC, DOCX, and TXT files are allowed');
      }

      // Check document limit (max 10 files)
      if (documents.length >= 10) {
        throw new Error('You can only upload a maximum of 10 documents per company');
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size must be less than 10MB');
      }

      

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${companyId}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-documents')
        .upload(filePath, file);

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        throw uploadError;
      }

      // Save document record
      const { error: dbError } = await supabase
        .from('company_documents')
        .insert({
          company_id: companyId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (dbError) throw dbError;

      await loadDocuments();

      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
    } catch (error: any) {
      console.error('Error uploading company document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload document',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDocument = async (document: CompanyDocument) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('company-documents')
        .remove([document.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('company_documents')
        .delete()
        .eq('id', document.id);

      if (dbError) throw dbError;

      await loadDocuments();

      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting company document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const downloadDocument = async (document: CompanyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('company-documents')
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
      console.error('Error downloading company document:', error);
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
          Company Documents ({documents.length}/10)
        </label>
      </div>

      {!isValidUUID(companyId) ? (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-muted-foreground/25 rounded-lg">
          <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">
            Select a company first to upload documents
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
              Drag files here or click to select
            </p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="company-document-upload"
              disabled={isUploading || documents.length >= 10}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading || documents.length >= 10}
              onClick={() => document.getElementById('company-document-upload')?.click()}
            >
              {isUploading ? 'Uploading...' : 'Select Files'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Maximum 10 documents • 10MB per file • PDF, DOC, DOCX, TXT formats
            </p>
          </div>

          {/* Documents Grid with Preview */}
          {documents.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Uploaded Documents:</h4>
              <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
                {documents.map((doc) => (
                  <CompanyPdfPreviewCard
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