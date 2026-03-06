import React from 'react';
import { X, Image as ImageIcon, FileText, Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { MessageImage, MessageDocument } from '@/types/chat';
import { formatFileSize } from '@/utils/imageUtils';

interface RFXFileUploadPreviewProps {
  images: MessageImage[];
  documents: MessageDocument[];
  onRemoveImage: (index: number) => void;
  onRemoveDocument: (index: number) => void;
  disabled?: boolean;
  isEncrypting?: boolean;
  /** Optional overall upload/encryption progress (0-100). */
  progressPercent?: number | null;
  /** Optional label shown next to progress (e.g. "2/4"). */
  progressLabel?: string | null;
}

const RFXFileUploadPreview: React.FC<RFXFileUploadPreviewProps> = ({
  images,
  documents,
  onRemoveImage,
  onRemoveDocument,
  disabled = false,
  isEncrypting = false,
  progressPercent = null,
  progressLabel = null,
}) => {
  // If there are no queued files yet, still render progress when encrypting/uploading.
  if (images.length === 0 && documents.length === 0 && !isEncrypting) {
    return null;
  }

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      {/* Encrypting indicator */}
      {isEncrypting && (
        <div className="pb-2 border-b space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm text-blue-600">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Encrypting and loading files...</span>
            </div>
            {typeof progressPercent === 'number' && (
              <span className="text-xs text-gray-600">
                {Math.round(progressPercent)}%{progressLabel ? ` (${progressLabel})` : ''}
              </span>
            )}
          </div>
          {typeof progressPercent === 'number' && (
            <Progress
              value={Math.max(0, Math.min(100, progressPercent))}
              className="h-2 bg-gray-200 [&_[data-state]]:bg-[#80c8f0]"
            />
          )}
        </div>
      )}

      {/* Images */}
      {images.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <ImageIcon className="h-4 w-4" />
            <span>Images ({images.length})</span>
            <Shield className="h-3 w-3 text-green-600" title="Encrypted" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {images.map((image, index) => (
              <div
                key={index}
                className="relative group rounded-lg overflow-hidden bg-white border"
              >
                {/* Preview image - using base64 preview */}
                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                  {image.data && image.data.startsWith('data:') ? (
                    // Show base64 preview (works for both encrypted and non-encrypted)
                    <img
                      src={image.data}
                      alt={image.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : image.metadata.preview && image.metadata.preview.startsWith('data:') ? (
                    // Fallback to preview field if data is URL
                    <img
                      src={image.metadata.preview}
                      alt={image.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // Fallback icon if no preview available
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  )}
                </div>

                {/* Filename and size */}
                <div className="p-2 bg-white border-t">
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {image.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(image.metadata.size)}
                  </p>
                </div>

                {/* Remove button */}
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveImage(index)}
                    className="absolute top-1 right-1 h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${image.filename}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}

                {/* Encrypted badge */}
                {image.metadata.encrypted && (
                  <div className="absolute bottom-12 left-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Shield className="h-2.5 w-2.5" />
                    <span>E2E</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <FileText className="h-4 w-4" />
            <span>Documents ({documents.length})</span>
            <Shield className="h-3 w-3 text-green-600" title="Encrypted" />
          </div>
          <div className="space-y-2">
            {documents.map((doc, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-white border rounded-lg group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {doc.filename}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-500">
                        {formatFileSize(doc.metadata.size)}
                      </p>
                      {doc.metadata.encrypted && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <Shield className="h-2.5 w-2.5" />
                          <span>Encrypted</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveDocument(index)}
                    className="h-8 w-8 p-0 text-gray-500 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${doc.filename}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info message */}
      <div className="flex items-center gap-2 text-xs text-gray-600 pt-2 border-t">
        <Shield className="h-3 w-3 text-green-600" />
        <span>All files are encrypted before upload (E2E encryption)</span>
      </div>
    </div>
  );
};

export default RFXFileUploadPreview;

