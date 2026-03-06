import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { generateUUID } from '@/utils/uuidUtils';

interface ProductData {
  product_name?: string;
  short_description?: string;
  long_description?: string;
  main_category?: string;
  subcategories?: string[];
  key_features?: string[];
  use_cases?: string[];
  target_industries?: string[];
  product_url?: string;
  definition_score?: string;
  improvement_advice?: string;
}

interface AutoFillRequest {
  freeText?: string;
  urls?: string[];
  existingPdfUrls?: string[];
}

interface ProgressData {
  stage: string;
  message: string;
}

interface UploadedFileInfo {
  fileName: string;
  bucketName: string;
  originalName: string;
  size: number;
  productId?: string;
}

export const useProductAutoFill = () => {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uploadedFilesRef = useRef<UploadedFileInfo[]>([]);
  const { toast } = useToast();

  const startProgressSimulation = () => {
    const startTime = Date.now();
    const duration = 20000; // 20 seconds
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min((elapsed / duration) * 100, 95); // Cap at 95% until real completion
      
      if (percentage < 95 && progressTimerRef.current) {
        progressTimerRef.current = setTimeout(updateProgress, 500);
      }
    };
    
    progressTimerRef.current = setTimeout(updateProgress, 500);
  };

  const stopProgressSimulation = () => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const clearAckTimeout = () => {
    if (ackTimeoutRef.current) {
      clearTimeout(ackTimeoutRef.current);
      ackTimeoutRef.current = null;
    }
  };

  const startAckTimeout = () => {
    ackTimeoutRef.current = setTimeout(() => {
      console.error('❌ Timeout - no response received in 90 seconds');
      
      // Cancel everything
      stopProgressSimulation();
      clearAckTimeout();
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      setIsLoading(false);
      setProgress(null);
      requestIdRef.current = null;
      
      toast({
        title: 'Connection Timeout',
        description: 'No response received from server within 90 seconds',
        variant: 'destructive'
      });
    }, 90000); // 90 seconds
  };

  // Restart the inactivity timeout on any incoming message to comply with
  // "If no message is received within 90 seconds, consider it a timeout"
  const restartAckTimeout = () => {
    clearAckTimeout();
    startAckTimeout();
  };

  const generateRequestId = () => {
    return generateUUID();
  };

  const uploadPdfFiles = async (files: File[], productId?: string): Promise<string[]> => {
    if (files.length === 0) return [];
    
    try {

      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
        
        // Always upload to product-documents bucket
        const bucketName = 'product-documents';
        const filePath = productId ? `${productId}/${fileName}` : `temp/${fileName}`;

         const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(filePath, file);
        
        if (error) {
          console.error('Error uploading file:', file.name, error);
          throw error;
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath);
        
        // Store file info for cleanup and database record
        uploadedFilesRef.current.push({
          fileName: filePath,
          bucketName,
          originalName: file.name,
          size: file.size,
          productId
        });
        
        return publicUrl;
      });
      
      const uploadedUrls = await Promise.all(uploadPromises);
      return uploadedUrls;
    } catch (error) {
      console.error('Error uploading PDF files:', error);
      throw error;
    }
  };


  const connectWebSocket = async (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      // Use the Railway production URL for auto-fill service
      // Updated to use production WebSocket endpoint
      const wsUrl = 'wss://productscrapermembers-production.up.railway.app/ws';
      // const wsUrl = 'ws://localhost:3003/ws';
      
      
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        resolve(ws);
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket connection error:', error);
        reject(new Error('Failed to connect to the auto-fill service'));
      };
      
      ws.onclose = (event) => {
        wsRef.current = null;
      };
    });
  };

  const autoFillProduct = useCallback(async (
    request: AutoFillRequest,
    onResult: (data: ProductData) => void,
    productId?: string
  ): Promise<void> => {
    if (!session) {
      throw new Error('User not authenticated');
    }

    try {
      setIsLoading(true);
      setStartTime(new Date());
      
      // No need to upload files here as they're already uploaded to temp from the modal

      // Connect to WebSocket
      setProgress({ stage: 'connecting', message: 'Connecting to auto-fill service...' });
      const ws = await connectWebSocket();

      // Generate unique request ID
      const requestId = generateRequestId();
      requestIdRef.current = requestId;

      // Start progress simulation and ACK timeout
      startProgressSimulation();
      startAckTimeout();

      

      // Send request with correct format
      const requestMessage = {
        type: 'REQUEST_PRODUCT_PARSE',
        api_version: 'v1',
        request_id: requestId,
        auth: { 
          supabase_jwt: session.access_token || 'test' 
        },
        payload: {
          free_text: request.freeText || '',
          source_urls: request.urls || [],
          document_urls: request.existingPdfUrls || [],
          hints: {
            language: 'es',
            reasoning_effort: 'medium',
            verbosity: 'medium',
            model_variant: 'gpt-5'
          }
        }
      };

      ws.send(JSON.stringify(requestMessage));

      // Handle WebSocket messages
      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          // Verify request_id matches
          if (data.request_id !== requestId) {
            console.warn('⚠️ Received message with different request_id:', data.request_id);
            return;
          }

          // Reset inactivity timeout on any valid message
          restartAckTimeout();

          switch (data.type) {
            case 'ACK':
              setProgress({ stage: 'processing', message: 'Request acknowledged, processing...' });
              break;

            case 'PROGRESS':
              setProgress({ 
                stage: data.stage || 'processing', 
                message: `${data.stage || 'Processing'} (${data.pct || 0}%)` 
              });
              break;

            case 'RESULT_OK':
              setProgress(null);
              setIsLoading(false);
              stopProgressSimulation();
              clearAckTimeout();
              
              // Note: PDF documents remain in temp folder and are not automatically moved to product folder
              // The user will need to manually manage temp files or implement cleanup
              
              // Call the result callback
              onResult(data.data);
              
              // Close WebSocket
              ws.close();
              break;

            case 'RESULT_ERROR':
              console.error('❌ Product parse failed:', data.error);
              
              setProgress(null);
              setIsLoading(false);
              stopProgressSimulation();
              clearAckTimeout();
              
              toast({
                title: 'Product Parse Failed',
                description: data.error?.message || 'An error occurred during product parsing',
                variant: 'destructive'
              });
              
              // Close WebSocket
              ws.close();
              break;

            default:
              console.warn('🤷 Unknown message type:', data.type);
              break;
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setProgress(null);
        setIsLoading(false);
        stopProgressSimulation();
        clearAckTimeout();
        
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to the auto-fill service',
          variant: 'destructive'
        });
      };

      ws.onclose = () => {
        setProgress(null);
        setIsLoading(false);
        stopProgressSimulation();
        clearAckTimeout();
        wsRef.current = null;
        requestIdRef.current = null;
      };

    } catch (error: any) {
      console.error('❌ Error in autoFillProduct:', error);
      setIsLoading(false);
      setProgress(null);
      stopProgressSimulation();
      clearAckTimeout();
      
      toast({
        title: 'Auto-fill Error',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
      
      throw error;
    }
  }, [session, toast]);

  const cancelRequest = useCallback(() => {
    
    // Stop progress simulation and timeouts
    stopProgressSimulation();
    clearAckTimeout();
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Reset state
    setIsLoading(false);
    setProgress(null);
    requestIdRef.current = null;
  }, []);

  return {
    autoFillProduct,
    cancelRequest,
    isLoading,
    progress,
    startTime
  };
};
