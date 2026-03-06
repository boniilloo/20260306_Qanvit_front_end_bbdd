import React, { useState } from 'react';
import { Youtube, Linkedin, Twitter, FileText, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const RFXFooter = () => {
  const currentYear = new Date().getFullYear();
  const [isConfidentialityModalOpen, setIsConfidentialityModalOpen] = useState(false);
  
  const confidentialityPdfUrl = "https://auth.fqsource.com/storage/v1/object/public/company-documents/USER%20-%20FQ%20SOURCE%20CONFIDENTIALITY%20COMMITMENT%20signed.pdf";
  
  return (
    <>
      <footer className="mt-auto w-full shrink-0">
        {/* Cuerpo principal del footer */}
        <div className="bg-white border-t border-gray-200 w-full">
          <div className="container mx-auto px-4 pt-3 pb-1">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Columna 1 - Logo y texto */}
                <div className="flex flex-col items-center justify-center gap-2">
                  <a
                    href="https://fqsource.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-90 transition-opacity"
                  >
                    <img
                      src="/lovable-uploads/FQ_LOGO.png"
                      alt="FQ Source"
                      className="object-contain opacity-80"
                      style={{ width: '110px', height: '80px' }}
                    />
                  </a>
                  
                </div>

                {/* Columna 2 - Legal */}
                <div className="flex flex-col gap-1.5 items-center text-center">
                  <h3 className="text-sm font-bold text-gray-700">Legal</h3>
                  <button
                    onClick={() => setIsConfidentialityModalOpen(true)}
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors cursor-pointer bg-transparent border-0 p-0"
                  >
                    Confidentiality
                  </button>
                  <a
                    href="https://fqsource.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors"
                  >
                    Terms & Conditions
                  </a>
                  <a
                    href="https://fqsource.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors"
                  >
                    Privacy Policy
                  </a>
                </div>

                {/* Columna 3 - About FQ Source */}
                <div className="flex flex-col gap-1.5 items-center text-center">
                  <h3 className="text-sm font-bold text-gray-700">About FQ Source</h3>
                  <a
                    href="https://github.com/boniilloo/FQ-Source-Cybersecurity-20251202"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors flex items-center gap-1"
                  >
                    <Shield className="h-3 w-3" />
                    Cybersecurity Audit
                  </a>
                  <a
                    href="https://fqsource.com/community"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors"
                  >
                    Community
                  </a>
                  <a
                    href="https://fqsource.com/faq"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors"
                  >
                    FAQ
                  </a>
                  <a
                    href="https://fqsource.com/faq"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-600 hover:text-[#1A1F2C] transition-colors"
                  >
                    Help
                  </a>
                </div>

                {/* Columna 4 - Redes sociales y copyright */}
                <div className="flex flex-col gap-2 items-center justify-center">
                  <div className="flex gap-4">
                    <a
                      href="https://www.youtube.com/@FQSource"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-[#ff0000] transition-colors"
                      aria-label="YouTube"
                    >
                      <Youtube className="h-5 w-5" />
                    </a>
                    <a
                      href="https://www.linkedin.com/company/fqsource"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-[#0077b5] transition-colors"
                      aria-label="LinkedIn"
                    >
                      <Linkedin className="h-5 w-5" />
                    </a>
                    <a
                      href="https://x.com/fqsourceAI"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-[#1da1f2] transition-colors"
                      aria-label="Twitter"
                    >
                      <Twitter className="h-5 w-5" />
                    </a>
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    <p>© {currentYear} FQ source</p>
                  </div>
                </div>
            </div>

            {/* Frase y botón centrado debajo de las columnas */}
            <div className="flex flex-col items-center justify-center mt-1.5 pt-1.5 border-t border-gray-200">
              <p className="text-gray-700 text-xs">
                Want to get help?{' '}
                <a
                  href="https://fqsource.com/book-demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1A1F2C] hover:underline transition-colors font-medium"
                >
                  Book a meeting with our experts!
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>

    {/* Confidentiality Document Modal */}
    <Dialog open={isConfidentialityModalOpen} onOpenChange={setIsConfidentialityModalOpen}>
      <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#1A1F2C]" />
            Confidentiality Commitment
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <iframe
            src={confidentialityPdfUrl}
            className="w-full h-full rounded-lg border border-gray-200"
            title="Confidentiality Commitment"
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default RFXFooter;

