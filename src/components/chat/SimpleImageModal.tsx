import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MessageImage } from '@/types/chat';

interface SimpleImageModalProps {
  images: MessageImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function SimpleImageModal({ 
  images, 
  currentIndex, 
  isOpen, 
  onClose, 
  onNavigate 
}: SimpleImageModalProps) {
  if (!isOpen) {
    return null;
  }

  const currentImage = images[currentIndex];

  if (!currentImage) {
    return null;
  }

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-90"
      onClick={onClose}
      style={{ 
        zIndex: 999999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh'
      }}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
        <img
          src={currentImage.data}
          alt={currentImage.filename}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
        style={{ zIndex: 1000000 }}
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
        <span className="text-sm font-medium">
          {currentImage.filename}
        </span>
        {images.length > 1 && (
          <span className="text-sm text-gray-300 ml-2">
            {currentIndex + 1} / {images.length}
          </span>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
