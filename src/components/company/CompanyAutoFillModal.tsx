import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Link, FileText, Sparkles, Loader2, Trash2, CheckCircle2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompanyAutoFill } from '@/hooks/useCompanyAutoFill';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { generateUUID } from '@/utils/uuidUtils';

interface CompanyAutoFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResult: (data: any) => void;
  companyId?: string;
}

interface LocalFile {
  type: 'local';
  file: File;
  id: string;
  tempPath?: string;
  tempUrl?: string;
}

interface ExistingDocument {
  type: 'existing';
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  url: string;
}

type PdfFileItem = LocalFile | ExistingDocument;

const CompanyAutoFillModal: React.FC<CompanyAutoFillModalProps> = ({ isOpen, onClose, onResult, companyId }) => {
  const [freeText, setFreeText] = useState('');
  const [urls, setUrls] = useState(['']);
  const [selectedPdfs, setSelectedPdfs] = useState<PdfFileItem[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<ExistingDocument[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const { autoFillCompany, cancelRequest, isLoading, progress, startTime } = useCompanyAutoFill();
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  const { toast } = useToast();

  const carouselMessages = useMemo(() => [
    'Fetching content...',
    'Extracting information...',
    'Structuring company profile...',
    'Organizing fields...',
    'Almost done...'
  ], []);
  const [carouselIndex, setCarouselIndex] = useState<number>(0);

  type UrlValidation = {
    isMinimalValid: boolean;
    minimalErrors: string[];
    networkChecked: boolean;
    networkOk: boolean | null;
    networkError?: string;
  };
  const [urlValidations, setUrlValidations] = useState<UrlValidation[]>([{ isMinimalValid: true, minimalErrors: [], networkChecked: false, networkOk: null }]);
  const controllersRef = useRef<(AbortController | null)[]>([null]);

  const validateUrlMinimal = (value: string): UrlValidation => {
    const errors: string[] = [];
    let u: URL | null = null;
    try { u = new URL(value); } catch { errors.push('Must be an absolute URL (e.g., https://example.com)'); }
    if (u && u.protocol !== 'https:') errors.push('Protocol must be HTTPS');
    if (u && !u.hostname) errors.push('Hostname must not be empty');
    return { isMinimalValid: errors.length === 0, minimalErrors: errors, networkChecked: false, networkOk: null };
  };

  const verifyUrlNetwork = async (index: number, value: string) => {
    if (!controllersRef.current[index]) controllersRef.current[index] = null;
    if (controllersRef.current[index]) { try { controllersRef.current[index]!.abort(); } catch {}
    }
    const controller = new AbortController();
    controllersRef.current[index] = controller;
    const quick = validateUrlMinimal(value);
    setUrlValidations(prev => { const copy = [...prev]; copy[index] = quick; return copy; });
    if (!quick.isMinimalValid) return;
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(value, { method: 'GET', redirect: 'follow', signal: controller.signal, mode: 'cors' });
      clearTimeout(timeoutId);
      let networkOk = res.ok;
      try { const finalUrl = new URL(res.url); if (finalUrl.protocol !== 'https:') networkOk = false; } catch {}
      if (networkOk) {
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('text/html') || ct.includes('text/plain') || ct.includes('application/xhtml')) {
            const text = await res.text();
            const cleaned = text.replace(/<[^>]*>/g, '').trim();
            if (cleaned.length === 0) networkOk = false;
          }
        } catch {}
      }
      setUrlValidations(prev => {
        const copy = [...prev];
        let networkError: string | undefined = undefined;
        if (!networkOk) {
          try {
            const finalUrl = new URL(res.url);
            if (finalUrl.protocol !== 'https:') networkError = 'Final URL after redirects must remain HTTPS';
            else if (!res.ok) networkError = 'GET request returned non-OK status';
            else networkError = 'Empty or unreadable content';
          } catch { networkError = 'GET request not OK or empty content'; }
        }
        copy[index] = { ...copy[index], networkChecked: true, networkOk, networkError };
        return copy;
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const aborted = e?.name === 'AbortError';
      const networkError = aborted ? 'Request timed out' : 'Could not verify due to CORS or network error';
      setUrlValidations(prev => { const copy = [...prev]; copy[index] = { ...copy[index], networkChecked: true, networkOk: aborted ? false : null, networkError }; return copy; });
    }
  };

  useEffect(() => {
    const loadExistingDocuments = async () => {
      if (!companyId || !isOpen) return;
      try {
        const { data: documents, error } = await supabase
          .from('company_documents')
          .select('*')
          .eq('company_id', companyId);
        if (error) { return; }
        const existingDocs: ExistingDocument[] = (documents || []).map((doc: any) => {
          const { data: { publicUrl } } = supabase.storage
            .from('company-documents')
            .getPublicUrl(doc.file_path);
          return { type: 'existing', id: doc.id, fileName: doc.file_name, filePath: doc.file_path, fileSize: doc.file_size, url: publicUrl };
        });
        setAvailableDocuments(existingDocs);
        setSelectedPdfs(existingDocs);
      } catch {}
    };
    loadExistingDocuments();
  }, [companyId, isOpen]);

  useEffect(() => {
    if (!isLoading || !startTime) { setElapsedTime('00:00'); return; }
    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setElapsedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoading, startTime]);

  useEffect(() => {
    if (!isLoading) return;
    const stageToIdx: Record<string, number> = { fetching_sources: 0, extracting_text: 1, llm_structuring: 2 };
    const initial = progress?.stage ? (stageToIdx[progress.stage] ?? 0) : 0;
    setCarouselIndex(initial);
    const id = setInterval(() => { setCarouselIndex((prev) => (prev + 1) % carouselMessages.length); }, 3000);
    return () => clearInterval(id);
  }, [isLoading, progress?.stage, carouselMessages.length]);

  useEffect(() => {
    if (urlValidations.length !== urls.length) {
      setUrlValidations(urls.map((u) => validateUrlMinimal(u)));
      controllersRef.current = new Array(urls.length).fill(null);
    }
  }, [urls.length]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isLoading) cancelRequest();
    onClose();
    setFreeText('');
    setUrls(['']);
    setSelectedPdfs([]);
    setAvailableDocuments([]);
    setShowSuccess(false);
  };

  const handleSubmit = async () => {
    const request: any = {};
    if (freeText.trim()) request.freeText = freeText.trim();
    const validUrls = urls.filter(url => url.trim() && url.startsWith('https://'));
    if (validUrls.length > 0) request.urls = validUrls;
    const localFiles = selectedPdfs.filter(p => p.type === 'local') as LocalFile[];
    const existingFiles = selectedPdfs.filter(p => p.type === 'existing') as ExistingDocument[];
    const tempUrls = localFiles.filter(f => f.tempUrl).map(f => f.tempUrl!);
    const existingUrls = existingFiles.map(f => f.url);
    const allPdfUrls = [...tempUrls, ...existingUrls];
    if (allPdfUrls.length > 0) request.existingPdfUrls = allPdfUrls;
    if (!request.freeText && !request.urls && !request.existingPdfUrls) { return; }
    await autoFillCompany(request, (data) => { onResult(data); setShowSuccess(true); });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    await uploadFiles(Array.from(files).filter(file => file.type === 'application/pdf'));
    event.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
    uploadFiles(files);
  };

  const uploadFiles = async (pdfFiles: File[]) => {
    if (pdfFiles.length === 0) return;
    try {
      setIsUploading(true);
      const uploadPromises = pdfFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
        const filePath = `temp/${fileName}`;
        const { data, error } = await supabase.storage
          .from('company-documents')
          .upload(filePath, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage
          .from('company-documents')
          .getPublicUrl(filePath);
        return { type: 'local' as const, file, id: generateUUID(), tempPath: filePath, tempUrl: publicUrl };
      });
      const uploadedFiles = await Promise.all(uploadPromises);
      setSelectedPdfs(prev => [...prev, ...uploadedFiles]);
      toast({ title: 'Files uploaded successfully', description: `${uploadedFiles.length} PDF file(s) uploaded to temporary storage` });
    } catch (error) {
      toast({ title: 'Upload failed', description: 'Failed to upload one or more files', variant: 'destructive' });
    } finally { setIsUploading(false); }
  };

  const removePdfItem = async (item: PdfFileItem) => {
    if (item.type === 'local') {
      if (item.tempPath) {
        try { await supabase.storage.from('company-documents').remove([item.tempPath]); } catch {}
      }
      setSelectedPdfs(prev => prev.filter(p => p.id !== item.id));
    } else {
      setSelectedPdfs(prev => prev.filter(p => p.id !== item.id));
      toast({ title: 'Document removed from list', description: 'The document is still available in your company files' });
    }
  };

  const addExistingDocument = (document: ExistingDocument) => {
    const isAlreadySelected = selectedPdfs.some(p => p.id === document.id);
    if (!isAlreadySelected) setSelectedPdfs(prev => [...prev, document]);
  };

  const getProgressText = () => {
    if (!progress) return '';
    switch (progress.stage) {
      case 'fetching_sources': return 'Fetching content...';
      case 'extracting_text': return 'Extracting information...';
      case 'llm_structuring': return 'Structuring company profile...';
      default: return 'Processing...';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="flex items-center gap-2">
              Company Auto-fill with FQ AI
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="How Auto-fill works" className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="z-[10002] max-w-sm text-xs leading-relaxed">
                    <div className="space-y-1">
                      <p><span className="font-medium">How it works:</span> Provide any of the sources below and FQ AI will extract and structure your company profile.</p>
                      <p><span className="font-medium">Description</span>: Paste a short or long text describing the company.</p>
                      <p><span className="font-medium">URLs</span>: Add one or more HTTPS pages. We fetch the content.</p>
                      <p><span className="font-medium">PDFs</span>: Upload brochures or corporate docs (PDF only). Multiple files are supported.</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
                <p className="text-sm text-muted-foreground mb-2">{carouselMessages[carouselIndex]}</p>
                <div className="text-2xl font-mono font-semibold text-foreground">{elapsedTime}</div>
                <p className="text-xs text-muted-foreground mt-1">Processing time</p>
              </div>
              <Button variant="outline" onClick={cancelRequest} className="w-full">Cancel</Button>
            </div>
          ) : showSuccess ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center mb-4"><CheckCircle2 className="w-16 h-16 text-green-500" /></div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-foreground">Auto-fill Completed</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">Your company information has been automatically populated. Review and adjust any fields as needed.</p>
              </div>
              <Button onClick={handleClose} className="w-full">Continue Editing Company</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter company information to automatically fill the form fields</p>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <Label htmlFor="freeText" className="text-sm font-medium">Company Description</Label>
                  </div>
                  <Textarea id="freeText" value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Describe the company (activities, markets, strengths, etc.)" className="min-h-[100px]" maxLength={2000000} />
                  <p className="text-xs text-muted-foreground">Maximum 2MB of text</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-medium">Company URLs</Label>
                  </div>
                  <div className="space-y-2">
                    {urls.map((url, index) => {
                      const v = urlValidations[index] || { isMinimalValid: true, minimalErrors: [], networkChecked: false, networkOk: null };
                      const isInvalid = !v.isMinimalValid || (v.networkChecked && v.networkOk === false);
                      const reasons: string[] = [];
                      if (!v.isMinimalValid) reasons.push(...v.minimalErrors);
                      if (v.networkChecked && v.networkOk === false && v.networkError) reasons.push(v.networkError);
                      return (
                        <div key={index} className="flex gap-2 items-start">
                          <Input value={url} onChange={(e) => { const newUrls = [...urls]; newUrls[index] = e.target.value; setUrls(newUrls); setUrlValidations(prev => { const copy = [...prev]; copy[index] = validateUrlMinimal(e.target.value); return copy; }); }} onBlur={() => url.trim() && verifyUrlNetwork(index, url.trim())} placeholder="https://empresa.com/" className={`flex-1 ${isInvalid ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
                          {isInvalid && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="h-9 w-9 flex items-center justify-center rounded-md border border-destructive text-destructive"><HelpCircle className="w-4 h-4" /></div>
                                </TooltipTrigger>
                                <TooltipContent className="z-[10002] max-w-xs text-xs">
                                  <div className="space-y-1">{reasons.map((r, i) => (<div key={i}>• {r}</div>))}</div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {urls.length > 1 && (
                            <Button variant="outline" size="sm" onClick={() => { setUrls(urls.filter((_, i) => i !== index)); setUrlValidations(prev => prev.filter((_, i) => i !== index)); controllersRef.current.splice(index, 1); }}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    <Button variant="outline" size="sm" onClick={() => { setUrls([...urls, '']); setUrlValidations(prev => [...prev, { isMinimalValid: true, minimalErrors: [], networkChecked: false, networkOk: null }]); controllersRef.current.push(null); }} className="w-full">Add URL</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Only HTTPS URLs allowed. We also run a quick reachability check with a 10s timeout.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-medium">PDF Documents</Label>
                  </div>
                  <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`} onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={handleDrop}>
                    {isUploading ? (<Loader2 className="h-8 w-8 mx-auto mb-4 text-primary animate-spin" />) : (<Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />)}
                    <p className="text-sm text-muted-foreground mb-2">{isUploading ? 'Uploading files...' : 'Drag PDF files here or click to select'}</p>
                    <input type="file" accept=".pdf" multiple onChange={handleFileUpload} className="hidden" id="company-pdf-upload-modal" disabled={isUploading} />
                    <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => document.getElementById('company-pdf-upload-modal')?.click()}> {isUploading ? 'Uploading...' : 'Select Files'} </Button>
                    <p className="text-xs text-muted-foreground mt-2">PDF format only • Files uploaded to temporary storage</p>
                  </div>

                  {selectedPdfs.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Selected PDF Files:</Label>
                      {selectedPdfs.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{item.type === 'local' ? item.file.name : item.fileName}</span>
                                {item.type === 'existing' && (<span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Existing</span>)}
                                {item.type === 'local' && (<span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">New</span>)}
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removePdfItem(item)} className="text-destructive hover:text-destructive" title={item.type === 'existing' ? 'Remove from list (file will remain saved)' : 'Remove file'}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {companyId && availableDocuments.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Available Documents:</Label>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {availableDocuments
                          .filter(doc => !selectedPdfs.some(p => p.id === doc.id))
                          .map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md border border-dashed">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                <div className="flex flex-col">
                                  <span className="text-sm text-muted-foreground">{doc.fileName}</span>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => addExistingDocument(doc)} className="text-primary hover:text-primary" title="Add to selection">+
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={handleClose} className="flex-1">Cancel</Button>
                <Button onClick={handleSubmit} disabled={!freeText.trim() && !urls.some(url => url.trim() && url.startsWith('https://')) && selectedPdfs.length === 0} className="flex-1">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Auto-fill
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyAutoFillModal;


