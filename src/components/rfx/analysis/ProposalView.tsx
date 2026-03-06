import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Download, Loader2 } from 'lucide-react';
import { SupplierAnalysis } from '@/hooks/useRFXAnalysisResult';
import SmartLogo from '@/components/ui/SmartLogo';
import MatchWithRFXSpecs from './MatchWithRFXSpecs';
import MarkdownText from './MarkdownText';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { NDAPdfViewerModal } from '@/components/rfx/NDAPdfViewerModal';

interface ProposalViewProps {
  supplier: SupplierAnalysis & {
    company_logo?: string | null;
    company_website?: string | null;
  };
  rfxId: string;
}

interface SupplierDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  category: 'proposal' | 'offer' | 'other';
  uploaded_at: string;
}

const ProposalView: React.FC<ProposalViewProps> = ({ supplier, rfxId }) => {
  const { executive_summary, quality_of_proposal, commercial_summary } = supplier;
  const [documents, setDocuments] = useState<SupplierDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string; mimeType?: string } | null>(null);
  const { toast } = useToast();
  const crypto = useRFXCrypto(rfxId);

  // Load documents when supplier changes
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        setLoadingDocuments(true);

        // 1. Find the invitation for this supplier
        const { data: invitations, error: invError } = await supabase
          .from('rfx_company_invitations' as any)
          .select('id')
          .eq('rfx_id', rfxId)
          .eq('company_id', supplier.company_uuid)
          .limit(1)
          .maybeSingle();

        if (invError || !invitations) {
          console.error('Error loading invitation:', invError);
          return;
        }

        const invitation = invitations as any;

        // 2. Get documents for this invitation
        const { data: docs, error: docsError } = await supabase
          .from('rfx_supplier_documents' as any)
          .select('*')
          .eq('rfx_company_invitation_id', invitation.id)
          .order('uploaded_at', { ascending: false });

        if (docsError) {
          console.error('Error loading documents:', docsError);
          return;
        }

        setDocuments((docs as unknown as SupplierDocument[]) || []);
      } catch (error) {
        console.error('Error loading supplier documents:', error);
      } finally {
        setLoadingDocuments(false);
      }
    };

    if (supplier.company_uuid) {
      loadDocuments();
    }
  }, [rfxId, supplier.company_uuid]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    return btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  };

  const viewFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('rfx-supplier-documents')
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = filePath.endsWith('.enc') && crypto.decryptFile && crypto.isReady;
      
      if (isEncryptedFile && crypto.decryptFile) {
        console.log('🔐 [ProposalView] Decrypting file for viewing:', fileName);
        const encryptedBuffer = await data.arrayBuffer();
        
        // Extract IV (first 12 bytes) and encrypted data
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        
        // Convert IV to base64
        const ivBase64 = arrayBufferToBase64(ivBytes);
        
        // Decrypt
        const decryptedBuffer = await crypto.decryptFile(dataBytes, ivBase64);
        if (!decryptedBuffer) {
          throw new Error('Failed to decrypt file');
        }
        
        // Detect MIME type based on original extension
        const fileNameWithoutEnc = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
        else if (originalExt === 'png') mimeType = 'image/png';
        else if (originalExt === 'gif') mimeType = 'image/gif';
        else if (originalExt === 'webp') mimeType = 'image/webp';
        
        // Create blob from decrypted data
        const blob = new Blob([decryptedBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setViewingPdf({ url, title: fileNameWithoutEnc, mimeType });
      } else {
        // Not encrypted, use directly
        const fileNameWithoutEnc = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = data.type || 'application/pdf';
        if (!mimeType || mimeType === 'application/octet-stream') {
          if (originalExt === 'pdf') mimeType = 'application/pdf';
          else if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
          else if (originalExt === 'png') mimeType = 'image/png';
        }
        const url = URL.createObjectURL(data);
        setViewingPdf({ url, title: fileName, mimeType });
      }
    } catch (error: any) {
      console.error('Error viewing file:', error);
      toast({
        title: 'Error',
        description: 'Failed to view file',
        variant: 'destructive',
      });
    }
  };

  const downloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('rfx-supplier-documents')
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = filePath.endsWith('.enc') && crypto.decryptFile && crypto.isReady;
      
      let blob: Blob;
      
      if (isEncryptedFile && crypto.decryptFile) {
        console.log('🔐 [ProposalView] Decrypting file for download:', fileName);
        const encryptedBuffer = await data.arrayBuffer();
        
        // Extract IV (first 12 bytes) and encrypted data
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        
        // Convert IV to base64
        const ivBase64 = arrayBufferToBase64(ivBytes);
        
        // Decrypt
        const decryptedBuffer = await crypto.decryptFile(dataBytes, ivBase64);
        if (!decryptedBuffer) {
          throw new Error('Failed to decrypt file');
        }
        
        // Detect MIME type based on original extension
        const fileNameWithoutEnc = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
        else if (originalExt === 'png') mimeType = 'image/png';
        
        // Create blob from decrypted data
        blob = new Blob([decryptedBuffer], { type: mimeType });
      } else {
        // Not encrypted, use directly
        blob = data;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  // Group documents by category
  const documentsByCategory = {
    proposal: documents.filter(d => d.category === 'proposal'),
    offer: documents.filter(d => d.category === 'offer'),
    other: documents.filter(d => d.category === 'other'),
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Supplier Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Company Logo */}
            <div className="flex-shrink-0">
              <SmartLogo
                logoUrl={supplier.company_logo}
                websiteUrl={supplier.company_website}
                companyName={supplier.supplier_name}
                size="lg"
                className="rounded-xl"
                isSupplierRoute={true}
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#1A1F2C]">{supplier.supplier_name}</h2>
              {supplier.company_website && (
                <a
                  href={supplier.company_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#80c8f0] hover:underline"
                >
                  {supplier.company_website}
                </a>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm font-medium text-gray-600">Status:</span>
                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                  Analyze
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Match with RFX Specs */}
        <div className="mb-6">
          <MatchWithRFXSpecs fitToRfx={supplier.fit_to_rfx} risks={executive_summary.risks} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="commercial">Commercial</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            {/* Executive Summary */}
            <div className="bg-[#f1f1f1] rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-[#1A1F2C]">Executive summary (AI)</h3>
              
              {/* Scope */}
              <div className="mb-4">
                <span className="font-semibold text-sm">Scope:</span>
                <div className="text-sm text-gray-700 mt-1">
                  <MarkdownText>{executive_summary.scope}</MarkdownText>
                </div>
              </div>

              {/* Lead Time */}
              <div className="mb-2">
                <span className="font-semibold text-sm">Lead time:</span>
                <div className="text-sm text-gray-700 mt-1">
                  <MarkdownText>{executive_summary.lead_time.text}</MarkdownText>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Commercial Tab */}
          <TabsContent value="commercial">
            <div className="bg-[#f1f1f1] rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-[#1A1F2C]">Commercial Summary</h3>
              
              {commercial_summary.total_price_main && (
                <div className="mb-3">
                  <span className="font-semibold text-sm">Total Price:</span>
                  <p className="text-2xl font-bold text-[#1A1F2C]">
                    {commercial_summary.currency || '$'}{commercial_summary.total_price_main.toLocaleString()}
                  </p>
                </div>
              )}

              <div>
                <span className="font-semibold text-sm">TCO Comment:</span>
                <div className="text-sm text-gray-700 mt-1">
                  <MarkdownText>{commercial_summary.tco_comment}</MarkdownText>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Attachments Tab */}
          <TabsContent value="attachments">
            {loadingDocuments ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#80c8f0]" />
              </div>
            ) : documents.length === 0 ? (
              <div className="bg-[#f1f1f1] rounded-lg p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No documents uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Proposal Documents */}
                {documentsByCategory.proposal.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A1F2C] mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Proposal ({documentsByCategory.proposal.length})
                    </h4>
                    <div className="space-y-2">
                      {documentsByCategory.proposal.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-[#1A1F2C] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {doc.file_name.replace('.enc', '')}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => viewFile(doc.file_path, doc.file_name)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadFile(doc.file_path, doc.file_name)}
                              className="h-8 w-8 p-0"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Offer Documents */}
                {documentsByCategory.offer.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A1F2C] mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Offer ({documentsByCategory.offer.length})
                    </h4>
                    <div className="space-y-2">
                      {documentsByCategory.offer.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-[#1A1F2C] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {doc.file_name.replace('.enc', '')}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => viewFile(doc.file_path, doc.file_name)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadFile(doc.file_path, doc.file_name)}
                              className="h-8 w-8 p-0"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Documents */}
                {documentsByCategory.other.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A1F2C] mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Other Documents ({documentsByCategory.other.length})
                    </h4>
                    <div className="space-y-2">
                      {documentsByCategory.other.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-[#1A1F2C] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {doc.file_name.replace('.enc', '')}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => viewFile(doc.file_path, doc.file_name)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadFile(doc.file_path, doc.file_name)}
                              className="h-8 w-8 p-0"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* PDF Viewer Modal */}
      <NDAPdfViewerModal
        open={!!viewingPdf}
        onOpenChange={(open) => {
          if (!open && viewingPdf) {
            URL.revokeObjectURL(viewingPdf.url);
            setViewingPdf(null);
          }
        }}
        pdfUrl={viewingPdf?.url || null}
        title={viewingPdf?.title || ''}
      />
    </Card>
  );
};

export default ProposalView;

