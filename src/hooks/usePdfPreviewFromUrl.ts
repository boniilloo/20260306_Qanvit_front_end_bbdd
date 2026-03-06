import { useEffect, useState, useRef } from 'react';
import { pdfFirstPageToJpeg } from '@/lib/pdfToImage';

type State = {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
};

/**
 * Hook to generate a preview image from an external PDF URL
 * Used for PDFs that are hosted externally (scraped from supplier websites)
 * instead of stored in Supabase storage
 */
export function usePdfPreviewFromUrl(pdfUrl: string | null) {
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
      cacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      cacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!pdfUrl) {
      setState({ imageUrl: null, isLoading: false, error: null });
      return;
    }

    // Check cache first
    if (cacheRef.current.has(pdfUrl)) {
      const cachedUrl = cacheRef.current.get(pdfUrl)!;
      setState({ imageUrl: cachedUrl, isLoading: false, error: null });
      return;
    }

    let abortController: AbortController | null = null;

    const loadPreview = async () => {
      setState({ imageUrl: null, isLoading: true, error: null });
      abortController = new AbortController();

      try {
        // Fetch the PDF from the external URL
        const response = await fetch(pdfUrl, {
          signal: abortController.signal,
          mode: 'cors', // Try CORS first
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }

        // Get the PDF as ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();

        // Generate JPEG from first page
        const jpegBlob = await pdfFirstPageToJpeg(arrayBuffer, {
          maxWidth: 800,
          quality: 0.8,
        });

        // Create object URL for img element
        const url = URL.createObjectURL(jpegBlob);

        // Cache the result
        cacheRef.current.set(pdfUrl, url);

        setState({ imageUrl: url, isLoading: false, error: null });
      } catch (error: any) {
        // Don't set error state if request was aborted
        if (error.name === 'AbortError') {
          return;
        }
        
        console.error('Error loading PDF preview from URL:', error);
        setState({
          imageUrl: null,
          isLoading: false,
          error: error?.message || 'Error generating preview from URL',
        });
      }
    };

    loadPreview();

    // Cleanup: abort fetch if component unmounts or URL changes
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [pdfUrl]);

  return state;
}

