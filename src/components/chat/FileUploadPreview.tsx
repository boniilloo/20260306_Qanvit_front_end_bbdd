import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { MessageImage, MessageDocument } from '@/types/chat';
import { getDocumentIcon, getDocumentTypeName, formatFileSize } from '@/utils/documentUtils';
import { formatFileSize as formatImageFileSize } from '@/utils/imageUtils';
import SimpleImageModal from './SimpleImageModal';

interface FileUploadPreviewProps {
  images: MessageImage[];
  documents: MessageDocument[];
  onRemoveImage: (index: number) => void;
  onRemoveDocument: (index: number) => void;
  disabled?: boolean;
  maxImages?: number;
  maxDocuments?: number;
}

export default function FileUploadPreview({
  images,
  documents,
  onRemoveImage,
  onRemoveDocument,
  disabled = false,
  maxImages = 4,
  maxDocuments = 3
}: FileUploadPreviewProps) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);

  const openImageModal = (index: number) => {
    setCurrentImageIndex(index);
    setModalOpen(true);
  };

  const closeImageModal = () => {
    setModalOpen(false);
  };

  const navigateImage = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentImageIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
    } else {
      setCurrentImageIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
    }
  };

  const totalFiles = images.length + documents.length;
  const totalSize = images.reduce((total, img) => total + img.metadata.size, 0) + 
                   documents.reduce((total, doc) => total + doc.metadata.size, 0);

  if (totalFiles === 0) return null;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      {/* Grid unificado de archivos */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {/* Imágenes */}
        {images.map((image, index) => (
          <div key={`img-${index}`} className="relative group">
            <div 
              className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => openImageModal(index)}
            >
              <img
                src={image.data}
                alt={image.filename}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Overlay con información */}
            <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-between p-2 pointer-events-none">
              {/* Botón de eliminar */}
              <Button
                variant="destructive"
                size="sm"
                className="self-end p-1 h-auto w-auto pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveImage(index);
                }}
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </Button>
              
              {/* Información del archivo */}
              <div className="text-white text-xs">
                <p className="truncate font-medium">{image.filename}</p>
                <p>{formatImageFileSize(image.metadata.size)}</p>
                {image.metadata.width && image.metadata.height && (
                  <p>{image.metadata.width}×{image.metadata.height}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Documentos */}
        {documents.map((doc, index) => (
          <div key={`doc-${index}`} className="relative group">
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer hover:border-green-300 transition-colors flex flex-col items-center justify-center p-2">
              <div className="text-3xl mb-1">
                {getDocumentIcon(doc.metadata.format)}
              </div>
              <p className="text-xs text-center font-medium truncate w-full">
                {doc.filename}
              </p>
            </div>
            
            {/* Overlay con información */}
            <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-between p-2 pointer-events-none">
              {/* Botón de eliminar */}
              <Button
                variant="destructive"
                size="sm"
                className="self-end p-1 h-auto w-auto pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveDocument(index);
                }}
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </Button>
              
              {/* Información del archivo */}
              <div className="text-white text-xs">
                <p className="truncate font-medium">{doc.filename}</p>
                <p>{formatFileSize(doc.metadata.size)}</p>
                <p>{getDocumentTypeName(doc.metadata.format)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Información adicional unificada */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          {images.length > 0 && (
            <span>
              {images.length}/{maxImages} images
            </span>
          )}
          {documents.length > 0 && (
            <span>
              {documents.length}/{maxDocuments} documents
            </span>
          )}
        </div>
        <span>
          Total: {formatFileSize(totalSize)}
        </span>
      </div>

      {/* Modal de imagen a pantalla completa */}
      <SimpleImageModal
        images={images}
        currentIndex={currentImageIndex}
        isOpen={modalOpen}
        onClose={closeImageModal}
        onNavigate={navigateImage}
      />
    </div>
  );
}
