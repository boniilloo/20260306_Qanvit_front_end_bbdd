import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pdfFirstPageToJpeg } from '@/lib/pdfToImage';

type State = {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
};

export function usePdfPreview(filePath: string) {
  
  const [state, setState] = useState<State>({ 
    imageUrl: null, 
    isLoading: false, 
    error: null 
  });
  
  // Mantener el cache del código original
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    
    if (!filePath) {
      return;
    }

    // Verificar cache primero
    if (cacheRef.current.has(filePath)) {
      const cachedUrl = cacheRef.current.get(filePath)!;
      setState({ imageUrl: cachedUrl, isLoading: false, error: null });
      return;
    }

    let revokedUrl: string | null = null;

    const loadPreview = async () => {
      setState({ imageUrl: null, isLoading: true, error: null });

      try {
        
        
        // 1) Descarga el PDF desde Supabase Storage (mantener funcionalidad original)
        const { data, error } = await supabase.storage
          .from('product-documents')
          .download(filePath);

        if (error) {
          console.error('❌ Supabase download error:', error);
          throw error;
        }
        
        

        // 2) Convertimos Blob → ArrayBuffer
        const arrayBuffer = await data.arrayBuffer();
        

        // 3) Generamos el JPEG de la 1ª página usando la nueva librería
        const jpegBlob = await pdfFirstPageToJpeg(arrayBuffer, {
          maxWidth: 800,  // miniatura nítida sin pesar demasiado
          quality: 0.8,   // mantener calidad del código original
        });

        // 4) Creamos URL de objeto para <img>
        const url = URL.createObjectURL(jpegBlob);
        revokedUrl = url;
        

        // Cachear el resultado (mantener funcionalidad original)
        cacheRef.current.set(filePath, url);

        setState({ imageUrl: url, isLoading: false, error: null });
        
      } catch (error: any) {
        console.error('❌ Preview generation failed for:', filePath, error);
        setState({
          imageUrl: null,
          isLoading: false,
          error: error?.message || 'Error generando la previsualización',
        });
      }
    };

    loadPreview();

    // Limpieza: revocar URL cuando el componente se desmonte o cambie el PDF
    return () => {
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [filePath]);

  return state;
}