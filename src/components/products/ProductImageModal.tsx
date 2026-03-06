import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Product } from '@/types/product';

interface ProductImageModalProps {
  open: boolean;
  selectedProduct: Product | null;
  currentImageIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const ProductImageModal: React.FC<ProductImageModalProps> = ({
  open,
  selectedProduct,
  currentImageIndex,
  onClose,
  onPrev,
  onNext,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors">
          <X className="w-6 h-6" />
        </button>

        {!selectedProduct?.image ? null : (
          <>
            {selectedProduct.image.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="absolute left-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {selectedProduct.image.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="absolute right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors">
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {selectedProduct.image && (
              <img
                src={selectedProduct.image[currentImageIndex]}
                alt={`${selectedProduct.product_name} - Image ${currentImageIndex + 1}`}
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            )}

            {selectedProduct.image && selectedProduct.image.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {currentImageIndex + 1} / {selectedProduct.image.length}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProductImageModal;


