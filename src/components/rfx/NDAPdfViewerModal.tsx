import React from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NDAPdfViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  title: string;
}

export const NDAPdfViewerModal: React.FC<NDAPdfViewerModalProps> = ({
  open,
  onOpenChange,
  pdfUrl,
  title,
}) => {
  const handleClose = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open && pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#22183a]" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded-lg border border-gray-200"
              title={title}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
            </div>
          )}
        </div>
        <DialogFooter className="px-6 pb-6">
          <Button onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};



