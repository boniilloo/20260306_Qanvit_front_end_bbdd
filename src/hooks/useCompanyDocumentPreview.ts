import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pdfFirstPageToJpeg } from '@/lib/pdfToImage';

type State = {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
};

export function useCompanyDocumentPreview(filePath: string, mimeType: string) {
  const [state, setState] = useState<State>({ 
    imageUrl: null, 
    isLoading: false, 
    error: null 
  });
  
  // Cache for generated previews
  const cacheRef = useRef<Map<string, string>>(new Map());
  
  // Cleanup function to revoke all cached URLs when component unmounts
  useEffect(() => {
    return () => {
      // Only cleanup on final unmount
      cacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      cacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!filePath || mimeType !== 'application/pdf') {
      return;
    }

    // Check cache first
    if (cacheRef.current.has(filePath)) {
      const cachedUrl = cacheRef.current.get(filePath)!;
      setState({ imageUrl: cachedUrl, isLoading: false, error: null });
      return;
    }

    const loadPreview = async () => {
      setState({ imageUrl: null, isLoading: true, error: null });

      try {
        // Download the PDF from Supabase Storage
        const { data, error } = await supabase.storage
          .from('company-documents')
          .download(filePath);

        if (error) {
          throw error;
        }

        // Convert Blob to ArrayBuffer
        const arrayBuffer = await data.arrayBuffer();

        // Generate JPEG from first page
        const jpegBlob = await pdfFirstPageToJpeg(arrayBuffer, {
          maxWidth: 800,
          quality: 0.8,
        });

        // Create object URL for img element
        const url = URL.createObjectURL(jpegBlob);

        // Cache the result
        cacheRef.current.set(filePath, url);

        setState({ imageUrl: url, isLoading: false, error: null });
      } catch (error: any) {
        setState({
          imageUrl: null,
          isLoading: false,
          error: error?.message || 'Error generating preview',
        });
      }
    };

    loadPreview();

    // Don't revoke URLs immediately - let them be cleaned up when cache is cleared
    // This prevents premature revocation during re-renders
  }, [filePath, mimeType]);

  return state;
}