import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, ImageIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import ProductImageUpload from '@/components/ProductImageUpload';
import { generateUUID } from '@/utils/uuidUtils';

export interface ImageCategory {
  id: string;
  name: string;
  images: string[];
}

interface RFXImagesCardProps {
  categories: ImageCategory[];
  onChange: (categories: ImageCategory[]) => void;
  rfxId?: string;
  disabled?: boolean; // Si es true, desactiva todos los botones e inputs
  lockedCategoryNames?: string[]; // Category names that cannot be edited manually
  publicCrypto?: {
    // For public RFXs, use the unencrypted key-based crypto
    isLoading: boolean;
    isReady: boolean;
    error: string | null;
    isEncrypted: boolean;
    encrypt: (text: string) => Promise<string>;
    decrypt: (text: string) => Promise<string>;
    encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
    decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
    key: CryptoKey | null;
  };
}

const defaultCategories = [
  { key: 'object_examples', name: 'Examples of the object to inspect' },
  { key: 'real_defects', name: 'Real defect examples' },
  { key: 'site_photos', name: 'Photos of installation site' },
];

export default function RFXImagesCard({
  categories,
  onChange,
  rfxId,
  disabled = false,
  lockedCategoryNames = [],
  publicCrypto,
}: RFXImagesCardProps) {
  // We don't want to use useRFXCrypto here because it creates redundant key loading.
  // Instead, we pass isEncrypted=true and rfxId to ProductImageUpload,
  // and let ProductImageUpload handle the crypto context internally.
  // However, ProductImageUpload uses useRFXCrypto internally too.
  // The issue with multiple logs is that RFXImagesCard renders multiple ProductImageUpload components (one per category),
  // AND RFXSpecs also uses useRFXCrypto.
  
  const addCategory = () => {
    const id = generateUUID();
    onChange([...categories, { id, name: 'New category', images: [] }]);
  };

  const removeCategory = (idx: number) => {
    onChange(categories.filter((_, i) => i !== idx));
  };

  const ensureDefaultsIfEmpty = () => {
    if (categories.length > 0) return;
    onChange(defaultCategories.map(c => ({ id: generateUUID(), name: c.name, images: [] })));
  };

  return (
    <div className="space-y-4">
      {categories.length === 0 && !disabled && (
        <Button variant="outline" onClick={ensureDefaultsIfEmpty}>
          <ImageIcon className="w-4 h-4 mr-2" />
          Add default image categories
        </Button>
      )}

      <Accordion type="multiple" className="w-full space-y-3">
        {categories.map((cat, idx) => {
          const isLockedCategory = lockedCategoryNames
            .some((lockedName) => lockedName.trim().toLowerCase() === cat.name.trim().toLowerCase());
          const categoryReadOnly = disabled || isLockedCategory;
          return (
          <AccordionItem key={cat.id} value={cat.id} className="border border-gray-200 rounded-lg shadow-sm bg-white">
            <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 hover:no-underline rounded-t-lg">
              <div className="flex items-center gap-3 w-full pr-4">
                <ImageIcon className="w-5 h-5 text-gray-500" />
                <div className="flex-1 text-left">
                  <div className="font-medium text-black">{cat.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {cat.images.length} {cat.images.length === 1 ? 'image' : 'images'}
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4 pt-2">
                {/* Category name input */}
                <div className="space-y-2">
                  <Label>Category name</Label>
                  <Input
                    value={cat.name}
                    onChange={(e) => {
                      const next = [...categories];
                      next[idx] = { ...cat, name: e.target.value };
                      onChange(next);
                    }}
                    placeholder="Category name"
                    disabled={categoryReadOnly}
                    readOnly={categoryReadOnly}
                  />
                </div>

                {/* Image upload */}
                <div className="space-y-2">
                  <Label>Images</Label>
                  <ProductImageUpload
                    images={cat.images}
                    onImagesChange={(imgs) => {
                      const next = [...categories];
                      next[idx] = { ...cat, images: imgs };
                      onChange(next);
                    }}
                    productId={cat.id}
                    bucket="rfx-images"
                    storagePath={`${rfxId || 'temp'}/${cat.id}`}
                    maxImages={10}
                    maxSizeInMB={5}
                    disabled={categoryReadOnly}
                    isEncrypted={true} // Always true for RFX images
                    rfxId={rfxId}
                    publicCrypto={publicCrypto}
                  />
                </div>

                {/* Delete button */}
                {!categoryReadOnly && (
                  <div className="flex justify-end pt-2 border-t">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => removeCategory(idx)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete category
                    </Button>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          );
        })}
      </Accordion>

      {!disabled && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={addCategory}>
            <Plus className="w-4 h-4 mr-2" />
            Add category
          </Button>
        </div>
      )}
    </div>
  );
}


