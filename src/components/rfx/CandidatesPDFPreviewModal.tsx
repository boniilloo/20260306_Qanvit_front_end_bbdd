import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface CandidatesPDFPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  generating: boolean;
}

const CandidatesPDFPreviewModal: React.FC<CandidatesPDFPreviewModalProps> = ({
  open,
  onOpenChange,
  pdfUrl,
  generating,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-4 bg-white [&>button]:hidden" style={{ width: '70vw', maxWidth: '70vw', height: '90vh', maxHeight: '90vh' }}>
        <div className="w-full h-full rounded-md border border-gray-200 overflow-hidden bg-white">
          {generating && !pdfUrl ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#1A1F2C]" />
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full" title="RFX Candidates PDF" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
              Unable to load preview
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CandidatesPDFPreviewModal;


