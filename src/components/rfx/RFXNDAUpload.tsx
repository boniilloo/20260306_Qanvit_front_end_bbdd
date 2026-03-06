import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, X, Eye, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RFXNDAUploadProps {
  rfxId: string;
  rfxStatus?: string;
  onNDAChange?: (hasNDA: boolean) => void;
  readOnly?: boolean;
}

interface NDAMetadata {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string;
}

export const RFXNDAUpload: React.FC<RFXNDAUploadProps> = ({ rfxId, rfxStatus, onNDAChange, readOnly = false }) => {
  const isRFXSent = rfxStatus && rfxStatus !== 'draft';
  const isDisabled = readOnly || isRFXSent;
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [ndaMetadata, setNdaMetadata] = useState<NDAMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Load existing NDA metadata
  useEffect(() => {
    loadNDAMetadata();
  }, [rfxId]);

  const loadNDAMetadata = async () => {
    try {
      setIsLoadingMetadata(true);
      // Load NDA for this RFX (one NDA per RFX)
      const { data, error } = await supabase
        .from('rfx_nda_uploads')
        .select('*')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading NDA metadata:', error);
        return;
      }

      const metadata = data as NDAMetadata | null;
      setNdaMetadata(metadata);
      // Notify parent component about NDA status
      if (onNDAChange) {
        onNDAChange(!!metadata);
      }
    } catch (error) {
      console.error('Error loading NDA metadata:', error);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): string | null => {
    if (file.type !== 'application/pdf') {
      return 'Only PDF files are allowed';
    }
    if (file.size > 10 * 1024 * 1024) {
      return 'File size must be less than 10MB';
    }
    return null;
  };

  const uploadNDA = async (file: File) => {
    if (isDisabled) return;

    const validationError = validateFile(file);
    if (validationError) {
      toast({
        title: 'Invalid file',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploading(true);

      // Delete old NDA if it exists
      if (ndaMetadata) {
        const { error: deleteError } = await supabase.storage
          .from('rfx-ndas')
          .remove([ndaMetadata.file_path]);

        if (deleteError) {
          console.error('Error deleting old NDA:', deleteError);
        }

        // Delete existing NDA record for this RFX
        await supabase
          .from('rfx_nda_uploads')
          .delete()
          .eq('rfx_id', rfxId);
      }

      // Upload new file
      const filePath = `${rfxId}/nda.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('rfx-ndas')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create NDA record for this RFX (one NDA per RFX)
      const { data: metadata, error: metadataError } = await supabase
        .from('rfx_nda_uploads')
        .insert({
          rfx_id: rfxId,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (metadataError) throw metadataError;

      const ndaData = metadata as NDAMetadata;
      setNdaMetadata(ndaData);

      // Notify parent component about NDA status
      if (onNDAChange) {
        onNDAChange(true);
      }

      toast({
        title: 'NDA uploaded',
        description: 'The NDA has been uploaded successfully',
      });
    } catch (error: any) {
      console.error('Error uploading NDA:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload NDA',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (isRFXSent) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await uploadNDA(files[0]);
    }
  }, [rfxId, ndaMetadata, isRFXSent]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isRFXSent) return;

    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadNDA(files[0]);
    }
  };

  const handleDelete = async () => {
    if (!ndaMetadata) return;
    if (isDisabled) return;

    if (!confirm('Are you sure you want to delete this NDA?')) return;

    try {
      setIsUploading(true);

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('rfx-ndas')
        .remove([ndaMetadata.file_path]);

      if (deleteError) throw deleteError;

      // Delete NDA record for this RFX
      const { error: metadataError } = await supabase
        .from('rfx_nda_uploads')
        .delete()
        .eq('rfx_id', rfxId);

      if (metadataError) throw metadataError;

      setNdaMetadata(null);

      // Notify parent component about NDA status
      if (onNDAChange) {
        onNDAChange(false);
      }

      toast({
        title: 'NDA deleted',
        description: 'The NDA has been deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting NDA:', error);
      toast({
        title: 'Delete failed',
        description: error.message || 'Failed to delete NDA',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleView = async () => {
    if (!ndaMetadata) return;

    try {
      const { data, error } = await supabase.storage
        .from('rfx-ndas')
        .createSignedUrl(ndaMetadata.file_path, 3600); // 1 hour expiry

      if (error) throw error;

      setPdfUrl(data.signedUrl);
      setShowPdfViewer(true);
    } catch (error: any) {
      console.error('Error loading PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to load PDF',
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  if (isLoadingMetadata) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {!ndaMetadata ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDisabled
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    : isDragging
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-400'
                }`}
              >
                <input
                  type="file"
                  id="nda-upload"
                  accept="application/pdf"
                  onChange={handleFileInput}
                  className="hidden"
                  disabled={isUploading || isDisabled}
                />
                <label 
                  htmlFor="nda-upload" 
                  className={isDisabled ? "cursor-not-allowed" : "cursor-pointer"}
                  onClick={(e) => {
                    if (isDisabled) {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className="flex flex-col items-center gap-3">
                    {isUploading ? (
                      <>
                        <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
                        <p className="text-sm font-medium text-gray-700">Uploading NDA...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            Drop NDA file here or click to upload
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            PDF only, max 10MB
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </label>
              </div>
            </TooltipTrigger>
            {isDisabled && (
              <TooltipContent>
                <p>{readOnly ? 'This is a read-only public example. Modifications are not allowed.' : 'NDA cannot be modified after the RFX has been sent'}</p>
              </TooltipContent>
            )}
          </Tooltip>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <FileText className="h-6 w-6 text-red-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {ndaMetadata.file_name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatFileSize(ndaMetadata.file_size)} • Uploaded {new Date(ndaMetadata.uploaded_at).toLocaleDateString()}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleView}
                    className="text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDelete}
                          disabled={isUploading || isDisabled}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {isRFXSent && (
                      <TooltipContent>
                        <p>NDA cannot be modified after the RFX has been sent</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <label htmlFor="nda-replace" className={isRFXSent ? "cursor-not-allowed" : "cursor-pointer"}>
                          <input
                            type="file"
                            id="nda-replace"
                            accept="application/pdf"
                            onChange={handleFileInput}
                            className="hidden"
                            disabled={isUploading || isRFXSent}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUploading || isRFXSent}
                            asChild
                          >
                            <span>
                              <Upload className="h-3 w-3 mr-1" />
                              Replace
                            </span>
                          </Button>
                        </label>
                      </div>
                    </TooltipTrigger>
                    {isRFXSent && (
                      <TooltipContent>
                        <p>NDA cannot be modified after the RFX has been sent</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            The NDA will be sent to suppliers along with the RFX. Make sure it's up to date before sending.
          </AlertDescription>
        </Alert>
      </div>

      {/* PDF Viewer Modal */}
      <Dialog open={showPdfViewer} onOpenChange={(open) => {
        setShowPdfViewer(open);
        if (!open && pdfUrl) {
          setPdfUrl(null);
        }
      }}>
        <DialogContent className="max-w-[60vw] w-[60vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-600" />
              NDA Document
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full rounded-lg border border-gray-200"
                title="NDA Document"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

