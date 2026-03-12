import React, { useMemo, useRef, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { decryptDocument, decryptImage, downloadDecryptedDocument } from '@/utils/rfxChatFileUtils';

type DecryptFileFn = (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>;

export type RFXChatEncryptedAttachmentsProps = {
  /** Used for stable keys + debug attribution */
  messageId: string;
  /** Attachments array stored in DB: [{ kind, filename, encryptedUrl, size, mimeType, uploadedAt, ... }] */
  attachments: any[];
  /** Decrypt function from useRFXCrypto / useRFXCryptoForCompany */
  decryptFile: DecryptFileFn | null | undefined;
  /** Optional debug tag to identify caller in console */
  debugTag?: string;
  /** Force debug logging on/off (defaults to DEV) */
  debug?: boolean;
};

const getUrlFileName = (url: string) =>
  String(url || '').split('/').pop()?.split('?')[0]?.toLowerCase() || '';

const isPdfAttachment = (a: any, filename: string, encryptedUrl: string) => {
  const mt = String(
    a?.mimeType ||
      a?.mime_type ||
      a?.format ||
      a?.contentType ||
      a?.content_type ||
      ''
  ).toLowerCase();
  const lowerName = String(filename || '').toLowerCase();
  const urlFileName = getUrlFileName(encryptedUrl);
  const urlWithoutEnc = urlFileName.endsWith('.enc') ? urlFileName.slice(0, -4) : urlFileName;

  return (
    mt === 'application/pdf' ||
    mt.includes('pdf') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.pdf.enc') ||
    urlFileName.endsWith('.pdf') ||
    urlFileName.endsWith('.pdf.enc') ||
    urlWithoutEnc.endsWith('.pdf')
  );
};

const RFXChatEncryptedAttachments: React.FC<RFXChatEncryptedAttachmentsProps> = ({
  messageId,
  attachments,
  decryptFile,
  debugTag,
  debug,
}) => {
  const { toast } = useToast();
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const loggedKeysRef = useRef<Set<string>>(new Set());

  const shouldDebug = debug ?? (import.meta as any)?.env?.DEV ?? false;

  const normalized = useMemo(() => (Array.isArray(attachments) ? attachments : []), [attachments]);
  if (normalized.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        {normalized.map((a, idx) => {
          const kind = String(a?.kind || 'file');
          const filename = String(a?.filename || 'attachment');
          const encryptedUrl = String(a?.encryptedUrl || a?.url || '');
          const isImage = kind === 'image';

          const debugKey = `${messageId}:${idx}:${filename}:${encryptedUrl}`;
          if (shouldDebug && !loggedKeysRef.current.has(debugKey)) {
            loggedKeysRef.current.add(debugKey);
            console.log(`🧩 [${debugTag || 'RFXChatEncryptedAttachments'}] attachment debug:`, {
              messageId,
              idx,
              kind,
              filename,
              encryptedUrl,
              raw: a,
            });
          }

          const isPdf = !isImage && isPdfAttachment(a, filename, encryptedUrl);
          const pdfDebugKey = `${debugKey}:pdfcheck`;
          if (shouldDebug && !loggedKeysRef.current.has(pdfDebugKey)) {
            loggedKeysRef.current.add(pdfDebugKey);
            console.log(`🧾 [${debugTag || 'RFXChatEncryptedAttachments'}] pdf detection:`, {
              messageId,
              idx,
              mt: String(
                a?.mimeType ||
                  a?.mime_type ||
                  a?.format ||
                  a?.contentType ||
                  a?.content_type ||
                  ''
              ).toLowerCase(),
              lowerName: filename.toLowerCase(),
              urlFileName: getUrlFileName(encryptedUrl),
              isPdf,
            });
          }

          return (
            <div
              key={`${messageId}_${idx}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#22183a] truncate">{filename}</div>
                <div className="text-[11px] text-gray-500">Encrypted attachment</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isImage && decryptFile && encryptedUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-[#22183a] hover:underline"
                    onClick={async () => {
                      try {
                        const url = await decryptImage(encryptedUrl, decryptFile);
                        setViewingImage({ url, title: filename });
                      } catch (err: any) {
                        toast({
                          title: 'Failed to view image',
                          description: err?.message || 'Could not decrypt image',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                )}

                {isPdf && decryptFile && encryptedUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-[#22183a] hover:underline"
                    onClick={async () => {
                      try {
                        const blob = await decryptDocument(encryptedUrl, decryptFile);
                        const url = URL.createObjectURL(blob);
                        setViewingPdf({ url, title: filename.endsWith('.enc') ? filename.slice(0, -4) : filename });
                      } catch (err: any) {
                        toast({
                          title: 'Failed to view PDF',
                          description: err?.message || 'Could not decrypt PDF',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                )}

                {decryptFile && encryptedUrl && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-[#22183a] hover:underline"
                    onClick={async () => {
                      try {
                        await downloadDecryptedDocument(encryptedUrl, filename, decryptFile);
                      } catch (err: any) {
                        toast({
                          title: 'Download failed',
                          description: err?.message || 'Could not decrypt/download file',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Image modal */}
      <Dialog
        open={!!viewingImage}
        onOpenChange={(open) => {
          if (!open && viewingImage?.url) {
            try {
              URL.revokeObjectURL(viewingImage.url);
            } catch {
              // ignore
            }
          }
          if (!open) setViewingImage(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{viewingImage?.title || 'Image'}</DialogTitle>
          </DialogHeader>
          {viewingImage?.url && (
            <div className="w-full max-h-[70vh] overflow-auto">
              <img src={viewingImage.url} alt={viewingImage.title} className="max-w-full h-auto" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PDF modal */}
      <Dialog
        open={!!viewingPdf}
        onOpenChange={(open) => {
          if (!open && viewingPdf?.url) {
            try {
              URL.revokeObjectURL(viewingPdf.url);
            } catch {
              // ignore
            }
          }
          if (!open) setViewingPdf(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{viewingPdf?.title || 'PDF'}</DialogTitle>
          </DialogHeader>
          {viewingPdf?.url && (
            <iframe src={viewingPdf.url} className="w-full h-[70vh] rounded-lg border" title={viewingPdf.title} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RFXChatEncryptedAttachments;


