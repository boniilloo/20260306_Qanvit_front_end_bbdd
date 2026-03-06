import React, { useState } from 'react';
import { FileText, Download, Shield, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadDecryptedDocument } from '@/utils/rfxChatFileUtils';
import { formatFileSize, getDocumentIcon, getDocumentTypeName } from '@/utils/documentUtils';

interface RFXEncryptedDocumentProps {
  encryptedUrl: string;
  filename: string;
  size: number;
  format: string;
  decryptFile: (encryptedBuffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
  onError?: () => void;
}

const RFXEncryptedDocument: React.FC<RFXEncryptedDocumentProps> = ({
  encryptedUrl,
  filename,
  size,
  format,
  decryptFile,
  onError,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setError(null);

      await downloadDecryptedDocument(encryptedUrl, filename, decryptFile);
    } catch (err) {
      console.error('🔐 [RFXEncryptedDocument] Error downloading document:', err);
      setError('Failed to decrypt and download document');
      onError?.();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Document icon */}
        <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <FileText className="h-5 w-5 text-blue-600" />
        </div>

        {/* Document info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {filename}
            </p>
            {encryptedUrl.endsWith('.enc') && (
              <div className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                <Shield className="h-3 w-3" />
                <span>E2E</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              {getDocumentTypeName(format)}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">
              {formatFileSize(size)}
            </span>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-red-600">
              <AlertCircle className="h-3 w-3" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Download button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
        className="h-8 w-8 p-0 text-gray-600 hover:text-blue-600 hover:bg-blue-50"
        aria-label={`Download ${filename}`}
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
};

export default RFXEncryptedDocument;

