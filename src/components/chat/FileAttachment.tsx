
import React from 'react';
import { X, FileText, Image, FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileAttachmentProps {
  file: File;
  onRemove?: () => void;
}

const FileAttachment = ({ file, onRemove }: FileAttachmentProps) => {
  const getFileIcon = () => {
    if (file.type.startsWith('image/')) {
      return <Image className="w-4 h-4" />;
    } else if (file.type.includes('pdf') || file.type.includes('document')) {
      return <FileText className="w-4 h-4" />;
    } else {
      return <FileIcon className="w-4 h-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 text-sm">
      {getFileIcon()}
      <span className="text-gray-700 truncate max-w-32">
        {file.name}
      </span>
      <span className="text-gray-500 text-xs">
        ({formatFileSize(file.size)})
      </span>
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-auto p-1 text-gray-500 hover:text-red-500"
          aria-label="Remove file"
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
};

export default FileAttachment;
