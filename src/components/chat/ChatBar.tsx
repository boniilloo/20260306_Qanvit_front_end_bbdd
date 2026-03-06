import { useState, useRef, useEffect, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Send, Keyboard, Image as ImageIcon, Upload, FileText } from "lucide-react";
import AccessibleButton from "@/components/ui/AccessibleButton";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FileUploadPreview from "./FileUploadPreview";
import { MessageImage, MessageDocument } from "@/types/chat";
import { filterImageFiles, processImages } from "@/utils/imageUtils";
import { filterDocumentFiles, processDocuments } from "@/utils/documentUtils";
import { useToast } from "@/hooks/use-toast";
interface ChatBarProps {
  onSend: (message: string, images?: MessageImage[], documents?: MessageDocument[]) => void;
  disabled?: boolean;
  placeholder?: string;
  onFileSelect?: (file: File) => void;
  isThinking?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  highlight?: boolean;
}
export default function ChatBar({
  onSend,
  disabled = false,
  placeholder = "What do you need?",
  onFileSelect,
  isThinking = false,
  inputRef: externalRef,
  highlight = false
}: ChatBarProps) {
  const [value, setValue] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [images, setImages] = useState<MessageImage[]>([]);
  const [documents, setDocuments] = useState<MessageDocument[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Auto-focus when component mounts and not disabled
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled, textareaRef]);

  // Send pending message when loading finishes
  useEffect(() => {
    if (!disabled && pendingMessage) {
      onSend(
        pendingMessage, 
        images.length > 0 ? images : undefined,
        documents.length > 0 ? documents : undefined
      );
      setPendingMessage("");
      setValue("");
      setImages([]);
      setDocuments([]);
    }
  }, [disabled, pendingMessage, onSend, images, documents]);


  // Check if keyboard shortcuts should be shown
  useEffect(() => {
    const preferences = localStorage.getItem('fq-interface-preferences');
    if (preferences) {
      try {
        const parsed = JSON.parse(preferences);
        setShowShortcuts(parsed.showKeyboardShortcuts !== false);
      } catch {
        setShowShortcuts(true);
      }
    } else {
      setShowShortcuts(true);
    }
  }, []);

  // Handle drag & drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide drag indicator if we're leaving the container completely
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = filterImageFiles(files);
    const documentFiles = filterDocumentFiles(files);
    
    if (imageFiles.length === 0 && documentFiles.length === 0) {
      toast({
        title: "No valid files found",
        description: "Please drag valid image files (JPEG, PNG, GIF, WebP) or documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, RTF)",
        variant: "destructive"
      });
      return;
    }

    setIsProcessingDrop(true);
    
    try {
      const promises = [];
      let processedImages: any[] = [];
      let processedDocuments: any[] = [];

      // Process images if any
      if (imageFiles.length > 0) {
        promises.push(
          processImages(imageFiles).then(images => {
            processedImages = images.map(({ preview, ...image }) => image);
          })
        );
      }

      // Process documents if any
      if (documentFiles.length > 0) {
        promises.push(
          processDocuments(documentFiles).then(docs => {
            processedDocuments = docs;
          })
        );
      }

      // Wait for all processing to complete
      await Promise.all(promises);

      // Update state with processed files
      if (processedImages.length > 0) {
        setImages(prev => [...prev, ...processedImages]);
      }
      
      if (processedDocuments.length > 0) {
        setDocuments(prev => [...prev, ...processedDocuments]);
      }

      // Show success message
      const messages = [];
      if (processedImages.length > 0) {
        messages.push(`${processedImages.length} image(s)`);
      }
      if (processedDocuments.length > 0) {
        messages.push(`${processedDocuments.length} document(s)`);
      }
      
      toast({
        title: "Files added",
        description: `${messages.join(' and ')} added successfully`
      });
    } catch (error) {
      console.error('Error processing dropped files:', error);
      toast({
        title: "Error processing files",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsProcessingDrop(false);
    }
  }, [disabled, toast]);

  // Manejar selección directa de imágenes desde el botón
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setIsProcessingDrop(true);
      try {
        const imageFiles = filterImageFiles(files);
        if (imageFiles.length > 0) {
          const processedImages = await processImages(imageFiles);
          const messageImages = processedImages.map(({ preview, ...image }) => image);
          
        setImages(prev => [...prev, ...messageImages]);
          
          toast({
            title: "Images added",
            description: `${imageFiles.length} image(s) added successfully`
          });
        } else {
          toast({
            title: "No valid images found",
            description: "Please select valid image files.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error processing selected images:', error);
        toast({
          title: "Error processing images",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsProcessingDrop(false);
      }
    }
    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }, [toast]);

  // Abrir selector de archivos de imagen
  const openImageSelector = useCallback(() => {
    if (!disabled && imageInputRef.current) {
      imageInputRef.current.click();
    }
  }, [disabled]);

  // Abrir selector de archivos de documento
  const openDocumentSelector = useCallback(() => {
    if (!disabled && documentInputRef.current) {
      documentInputRef.current.click();
    }
  }, [disabled]);

  // Manejar selección directa de documentos desde el botón
  const handleDocumentSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setIsProcessingDrop(true);
      try {
        const documentFiles = filterDocumentFiles(files);
        if (documentFiles.length > 0) {
          const processedDocuments = await processDocuments(documentFiles);
          
        setDocuments(prev => [...prev, ...processedDocuments]);
          
          toast({
            title: "Documents added",
            description: `${documentFiles.length} document(s) added successfully`
          });
        } else {
          toast({
            title: "No valid documents found",
            description: "Please select valid document files.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error processing selected documents:', error);
        toast({
          title: "Error processing documents",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsProcessingDrop(false);
      }
    }
    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  }, [toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift + Enter = new line (default behavior)
        return;
      } else {
        // Enter = send message
        e.preventDefault();
        fireSend();
      }
    }
  };
  const fireSend = () => {
    if (!value.trim() && images.length === 0 && documents.length === 0) return;
    if (disabled) {
      // Store message to send when loading finishes
      setPendingMessage(value.trim());
      return;
    }
    onSend(
      value.trim(), 
      images.length > 0 ? images : undefined,
      documents.length > 0 ? documents : undefined
    );
    setValue("");
    setImages([]);
    setDocuments([]);
  };
  const clearInput = () => {
    setValue("");
    setPendingMessage("");
    setImages([]);
    setDocuments([]);
    textareaRef.current?.focus();
  };
  const focusInput = () => {
    textareaRef.current?.focus();
  };

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onSend: fireSend,
    onClear: clearInput,
    onFocus: focusInput,
    disabled: disabled && !value.trim()
  });
  const getPlaceholderText = () => {
    if (disabled && pendingMessage) {
      return "Message ready to send when FQ finishes...";
    }
    if (isThinking) {
      return "FQ is thinking... (you can write your next message)";
    }
    if (disabled) {
      return "FQ is working... (you can write your next message)";
    }
    return placeholder;
  };
  const getBorderClass = () => {
    if (isDragOver) {
      return "border-blue-400 bg-blue-50/70 shadow-lg shadow-blue-200/50 border-2 border-dashed";
    }
    if (disabled && pendingMessage) {
      return "border-[#7de19a] bg-green-50/50 shadow-lg shadow-green-200/50";
    }
    if (isThinking) {
      return "border-yellow-400 bg-yellow-50/50 shadow-lg shadow-yellow-200/50";
    }
    if (disabled) {
      return "border-[#80c8f0] bg-blue-50/50 shadow-lg shadow-blue-200/50";
    }
    return "border-slate-200 hover:border-[#80c8f0]/50 focus-within:border-[#80c8f0] focus-within:shadow-lg focus-within:shadow-[#80c8f0]/20";
  };
  return <div className="space-y-2">
      {/* Hidden file input for image selection */}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
        disabled={disabled}
      />

      {/* Hidden file input for document selection */}
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"
        onChange={handleDocumentSelect}
        className="hidden"
        disabled={disabled}
      />
      
      {/* Keyboard shortcuts hint */}
      {showShortcuts && !disabled}
      
      {/* Unified file upload preview */}
      {(images.length > 0 || documents.length > 0) && (
        <FileUploadPreview
          images={images}
          documents={documents}
          onRemoveImage={(index) => {
            const updatedImages = images.filter((_, i) => i !== index);
            setImages(updatedImages);
          }}
          onRemoveDocument={(index) => {
            const updatedDocuments = documents.filter((_, i) => i !== index);
            setDocuments(updatedDocuments);
          }}
          disabled={disabled}
        />
      )}
      
      <div 
        ref={containerRef}
        className={`
          w-full flex gap-3 items-end p-4 rounded-2xl
          shadow-sm transition-all duration-300 relative
          ${highlight ? 'ring-4 ring-blue-500 shadow-xl' : 'bg-white'}
          ${!highlight ? getBorderClass() : ''}
        `}
        style={{
          transition: 'all 0.3s ease-in-out',
          ...(highlight && {
            animation: 'highlightFade 2s ease-in-out forwards',
            '--tw-ring-opacity': '0.8'
          })
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag & Drop Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-blue-50/80 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Upload className="w-8 h-8" />
              <span className="text-sm font-medium">Drop images and documents here</span>
            </div>
          </div>
        )}
        
        {/* Processing indicator */}
        {isProcessingDrop && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="text-sm font-medium">Processing files...</span>
            </div>
          </div>
        )}

        <TextareaAutosize 
          ref={textareaRef} 
          value={value} 
          onChange={e => setValue(e.target.value)} 
          onKeyDown={handleKeyDown} 
          minRows={1} 
          maxRows={6} 
          placeholder={getPlaceholderText()} 
          className="flex-1 resize-none border-0 outline-none bg-transparent text-sm leading-6 placeholder:text-gray-500 transition-all duration-200" 
          aria-label="Chat message" 
        />

        {/* Image upload button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={openImageSelector}
          disabled={disabled || isProcessingDrop}
          className={`
            p-2 rounded-full shrink-0 transition-all duration-200
            ${images.length > 0 ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
            ${isProcessingDrop ? 'opacity-50' : ''}
          `}
          aria-label="Seleccionar imágenes"
        >
          <ImageIcon className="w-4 h-4" />
          {images.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {images.length}
            </span>
          )}
        </Button>

        {/* Document upload button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={openDocumentSelector}
          disabled={disabled || isProcessingDrop}
          className={`
            p-2 rounded-full shrink-0 transition-all duration-200
            ${documents.length > 0 ? 'bg-green-100 text-green-600 ring-2 ring-green-300' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
            ${isProcessingDrop ? 'opacity-50' : ''}
          `}
          aria-label="Seleccionar documentos"
        >
          <FileText className="w-4 h-4" />
          {documents.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {documents.length}
            </span>
          )}
        </Button>

        <AccessibleButton 
          onClick={fireSend} 
          disabled={!value.trim() && images.length === 0 && documents.length === 0} 
          loading={disabled && (Boolean(value.trim()) || images.length > 0 || documents.length > 0)} 
          size="md" 
          className={`
            p-3 rounded-full shrink-0
            ${disabled && (value.trim() || images.length > 0 || documents.length > 0) ? 'animate-pulse' : (!value.trim() && images.length === 0 && documents.length === 0) ? 'opacity-50' : 'hover:scale-110 active:scale-95'}
          `} 
          aria-label={disabled && (value.trim() || images.length > 0 || documents.length > 0) ? "Message ready to send" : "Send message"}
        >
          <Send className="w-5 h-5" />
        </AccessibleButton>
      </div>
    </div>;
}