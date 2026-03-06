
import React, { useRef, useState, useCallback } from 'react';
import { Paperclip, Upload, FileText, Image, FileIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface EnhancedFileUploadProps {
  onFileSelect?: (file: File) => void;
  onMultipleFileSelect?: (files: File[]) => void;
  onFilesChange?: (files: File[]) => void; // New callback for when files change
  maxFiles?: number;
  maxSize?: number; // in MB
}

const EnhancedFileUpload = ({ 
  onFileSelect, 
  onMultipleFileSelect, 
  onFilesChange,
  maxFiles = 5,
  maxSize = 5 // Reduced to 5MB limit
}: EnhancedFileUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.includes('pdf') || type.includes('document')) return <FileText className="w-4 h-4" />;
    return <FileIcon className="w-4 h-4" />;
  };

  const validateFile = (file: File): boolean => {
    if (file.size > maxSize * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `File size must be less than ${maxSize}MB`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(validateFile);
    if (validFiles.length === 0) return;
    
    const updatedFiles = [...selectedFiles, ...validFiles].slice(0, maxFiles);
    setSelectedFiles(updatedFiles);
    
    // Call callbacks for backwards compatibility
    if (validFiles.length === 1) {
      onFileSelect?.(validFiles[0]);
    } else if (onMultipleFileSelect) {
      onMultipleFileSelect(validFiles.slice(0, maxFiles));
    } else if (validFiles.length > 0) {
      onFileSelect?.(validFiles[0]);
    }
    
    // Call the new files change callback
    onFilesChange?.(updatedFiles);
  };

  const removeFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    onFilesChange?.(updatedFiles);
  };

  const handleFiles = (files: FileList) => {
    const fileArray = Array.from(files);
    addFiles(fileArray);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFiles(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter(prev => prev - 1);
    if (dragCounter <= 1) {
      setIsDragOver(false);
    }
  }, [dragCounter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDragCounter(0);
    
    const files = e.dataTransfer.files;
    if (files) {
      handleFiles(files);
    }
  }, []);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`relative transition-all duration-200 ${
        isDragOver ? 'scale-105' : ''
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.csv,.xlsx"
        multiple={!!onMultipleFileSelect}
        className="hidden"
        aria-label="Upload file"
      />
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={triggerFileSelect}
        className={`w-full h-12 border-2 border-dashed transition-all duration-300 group ${
          isDragOver 
            ? 'border-primary bg-primary/5 text-primary scale-[1.02] shadow-sm' 
            : 'border-border hover:border-primary hover:bg-primary/5 hover:text-primary'
        }`}
        aria-label="Attach file"
      >
        <div className="flex items-center gap-2">
          {isDragOver ? (
            <Upload className="w-4 h-4 animate-bounce" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {isDragOver ? 'Drop here' : 'Attach file'}
          </span>
        </div>
      </Button>
      
      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Selected files ({selectedFiles.length})
            </span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border group hover:bg-muted/70 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="text-muted-foreground">
                    {getFileIcon(file.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="h-8 w-8 p-0 opacity-70 hover:opacity-100 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 bg-primary/10 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-background rounded-2xl p-8 shadow-2xl border-2 border-dashed border-primary text-center animate-in fade-in-0 zoom-in-95 duration-200">
            <Upload className="w-12 h-12 text-primary mx-auto mb-4 animate-bounce" />
            <p className="text-lg font-medium text-foreground mb-2">Drop files here</p>
            <p className="text-sm text-muted-foreground">
              Technical documents, images, and data files
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedFileUpload;
