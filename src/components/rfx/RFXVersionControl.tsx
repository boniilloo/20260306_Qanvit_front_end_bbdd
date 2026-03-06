import React, { useState, useEffect } from 'react';
import { GitBranch, Plus, History, RotateCcw, Eye, HelpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRFXVersionControl, type RFXCommit, type RFXSpecs } from '@/hooks/useRFXVersionControl';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebar } from '@/components/ui/sidebar';

interface Props {
  rfxId: string;
  currentSpecs: RFXSpecs;
  sentCommitId?: string | null;
  onRestore: (specs: RFXSpecs, commitId: string) => void;
  hasUnsavedChanges?: boolean;
  onOpenHelp?: () => void;
  externalCommitDialogOpen?: boolean;
  onExternalCommitDialogClose?: () => void;
  onCommitCreated?: () => void;
}

const RFXVersionControl: React.FC<Props> = ({ 
  rfxId, 
  currentSpecs, 
  sentCommitId,
  onRestore, 
  hasUnsavedChanges, 
  onOpenHelp,
  externalCommitDialogOpen = false,
  onExternalCommitDialogClose,
  onCommitCreated
}) => {
  const { commits, loading, loadCommits, createCommit, restoreCommit, getUserDisplayName, baseCommitInfo, checkBaseCommit } = useRFXVersionControl(rfxId);
  const { state: sidebarState } = useSidebar();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  
  // Sync external dialog state
  useEffect(() => {
    if (externalCommitDialogOpen) {
      setIsCommitDialogOpen(true);
    }
  }, [externalCommitDialogOpen]);
  const [selectedCommit, setSelectedCommit] = useState<RFXCommit | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Calculate left position based on sidebar state
  const leftPosition = sidebarState === 'expanded' ? 'left-[calc(280px+1.5rem)]' : 'left-[calc(72px+1.5rem)]';

  useEffect(() => {
    if (isHistoryOpen) {
      loadCommits();
    }
  }, [isHistoryOpen, loadCommits]);

  // Check base commit whenever specs change
  useEffect(() => {
    checkBaseCommit(currentSpecs);
  }, [currentSpecs, checkBaseCommit]);

  const handleCreateCommit = async () => {
    if (!commitMessage.trim() || isCreatingVersion) return;

    setIsCreatingVersion(true);
    try {
      const success = await createCommit(currentSpecs, commitMessage.trim());
      if (success) {
        setCommitMessage('');
        setIsCommitDialogOpen(false);
        // Notify parent if this was an external dialog
        if (onExternalCommitDialogClose) {
          onExternalCommitDialogClose();
        }
        // Refresh base commit info after creating a commit
        await checkBaseCommit(currentSpecs);
        // Notify parent that a commit was created
        if (onCommitCreated) {
          onCommitCreated();
        }
      }
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleRestoreCommit = async (commitId: string) => {
    // Check if there are uncommitted changes
    if (baseCommitInfo.hasUncommittedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Restoring a different version will discard these changes. Do you want to continue?'
      );
      if (!confirmed) return;
    }

    const specs = await restoreCommit(commitId);
    if (specs) {
      onRestore(specs, commitId);
      setIsHistoryOpen(false);
      // Refresh base commit info after restore
      // Note: We need to wait a bit for the DB update to complete
      setTimeout(() => {
        checkBaseCommit(specs);
      }, 500);
    }
  };

  const handleViewCommit = (commit: RFXCommit) => {
    setSelectedCommit(commit);
    setIsViewDialogOpen(true);
  };

  const getDiff = (current: string | null, previous: string | null): string => {
    if (current === previous) return 'No changes';
    if (!previous) return 'Added';
    if (!current) return 'Removed';
    return 'Modified';
  };

  const getJsonDiff = (current: any, previous: any): string => {
    const currentStr = JSON.stringify(current);
    const previousStr = JSON.stringify(previous);
    
    if (currentStr === previousStr) return 'No changes';
    if (!previous || previousStr === 'null') return 'Added';
    if (!current || currentStr === 'null') return 'Removed';
    return 'Modified';
  };

  const formatJsonForDisplay = (data: any): string => {
    if (!data) return 'No data';
    return JSON.stringify(data, null, 2);
  };

  const formatTimeline = (timeline: any): JSX.Element => {
    if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
      return <span className="text-gray-400">No timeline data</span>;
    }

    return (
      <div className="space-y-2">
        {timeline.map((milestone: any, index: number) => (
          <div key={milestone.id || index} className="border-l-2 border-gray-300 pl-3 py-1">
            <div className="font-medium text-sm">{milestone.label}</div>
            <div className="text-xs text-gray-600">
              {milestone.date.type === 'absolute' ? (
                <span>📅 {new Date(milestone.date.date).toLocaleDateString()}</span>
              ) : (
                <span>
                  ⏱️ {milestone.date.amount} {milestone.date.unit} after{' '}
                  {milestone.date.from === 'rfq_launch' ? 'RFQ launch' : 'previous milestone'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const formatImages = (images: any): JSX.Element => {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return <span className="text-gray-400">No images</span>;
    }

    return (
      <div className="space-y-3">
        {images.map((category: any, index: number) => (
          <div key={category.id || index} className="border rounded-md p-2">
            <div className="font-medium text-sm mb-2">{category.name}</div>
            <div className="grid grid-cols-3 gap-2">
              {category.images?.map((url: string, imgIndex: number) => (
                <div key={imgIndex} className="aspect-square rounded overflow-hidden bg-gray-100">
                  <img 
                    src={url} 
                    alt={`${category.name} ${imgIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const formatPdfCustomization = (pdfCustom: any): JSX.Element => {
    if (!pdfCustom) {
      return <span className="text-gray-400">No PDF customization</span>;
    }

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded p-2">
            <div className="text-xs font-medium text-gray-500 mb-1">Header Background</div>
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded border border-gray-300" 
                style={{ backgroundColor: pdfCustom.pdf_header_bg_color }}
              />
              <span className="text-sm font-mono">{pdfCustom.pdf_header_bg_color}</span>
            </div>
          </div>
          
          <div className="border rounded p-2">
            <div className="text-xs font-medium text-gray-500 mb-1">Header Text</div>
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded border border-gray-300" 
                style={{ backgroundColor: pdfCustom.pdf_header_text_color }}
              />
              <span className="text-sm font-mono">{pdfCustom.pdf_header_text_color}</span>
            </div>
          </div>

          <div className="border rounded p-2">
            <div className="text-xs font-medium text-gray-500 mb-1">Section Header Background</div>
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded border border-gray-300" 
                style={{ backgroundColor: pdfCustom.pdf_section_header_bg_color }}
              />
              <span className="text-sm font-mono">{pdfCustom.pdf_section_header_bg_color}</span>
            </div>
          </div>

          <div className="border rounded p-2">
            <div className="text-xs font-medium text-gray-500 mb-1">Section Header Text</div>
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded border border-gray-300" 
                style={{ backgroundColor: pdfCustom.pdf_section_header_text_color }}
              />
              <span className="text-sm font-mono">{pdfCustom.pdf_section_header_text_color}</span>
            </div>
          </div>
        </div>

        {(pdfCustom.pdf_logo_url || pdfCustom.pdf_pages_logo_url) && (
          <div className="border-t pt-2 mt-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Logos</div>
            <div className="space-y-2">
              {pdfCustom.pdf_logo_url && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Header Logo:</span>
                  <img src={pdfCustom.pdf_logo_url} alt="Header logo" className="h-8 max-w-[100px] object-contain" />
                </div>
              )}
              {pdfCustom.pdf_pages_logo_url && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Pages Logo:</span>
                  <img src={pdfCustom.pdf_pages_logo_url} alt="Pages logo" className="h-8 max-w-[100px] object-contain" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const getPreviousCommit = (index: number): RFXCommit | null => {
    return commits[index + 1] || null;
  };

  return (
    <>
      {/* Floating buttons - all together with uniform spacing */}
      <div className={`fixed bottom-6 z-50 transition-[left] duration-200 ease-linear ${leftPosition}`}>
        <div className="flex flex-col gap-3">
          {/* History button */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="h-14 w-14 rounded-full bg-[#80c8f0] hover:bg-[#80c8f0]/90 text-white shadow-lg flex items-center justify-center transition-colors"
            title="Version history"
            data-onboarding-target="rfx-versions-button"
          >
            <GitBranch className="h-7 w-7" strokeWidth={2.5} />
          </button>
          
          {/* Help button */}
          {!isHelpOpen && (
            <button
              onClick={() => setIsHelpOpen(true)}
              className="h-14 w-14 rounded-full bg-[#80c8f0] hover:bg-[#80c8f0]/90 text-white shadow-lg flex items-center justify-center transition-colors"
              title="Help"
            >
              <HelpCircle className="h-7 w-7" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
      
      {/* Help panel */}
      {isHelpOpen && (
        <div className={`fixed bottom-6 z-50 transition-[left] duration-200 ease-linear ${leftPosition}`}>
          <div className="relative max-w-md">
            <div className="bg-[#1A1F2C] rounded-2xl shadow-xl border border-[#80c8f0]/20 p-4 pr-10">
              <button
                aria-label="Close assistant"
                onClick={() => setIsHelpOpen(false)}
                className="absolute top-2 right-2 text-[#80c8f0] hover:text-[#80c8f0]/80 transition-colors"
              >
                <Eye className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="h-8 w-8 rounded-full bg-[#80c8f0] text-[#1A1F2C] grid place-items-center">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-base text-white font-medium">Let's define your RFX specifications!</p>
                  <div className="text-base text-[#80c8f0]/90 space-y-2">
                    <p>Here you'll define the basic specifications of your RFX.</p>
                    <p>We know filling out this document completely can be tedious, so we've programmed an <span className="font-semibold text-[#80c8f0]">RFX Assistant</span> on the right that will be happy to fill out the RFX for you! Just ask and it will help.</p>
                    <p>Don't forget to add the project timeline and images to complete your RFQ - they make a big difference!</p>
                    <p>At the bottom you'll find a button to generate a PDF with all the information provided. You can even customize it with your company's colors and logos in the <span className="font-semibold text-[#80c8f0]">PDF Customization</span> section.</p>
                    <p><span className="font-semibold text-[#80c8f0]">Version Control:</span> Use the floating buttons on the left to manage your changes. Click the <span className="font-semibold text-[#80c8f0]">History</span> icon to view all versions, create new versions to save your work, and restore previous versions if needed. </p>
                  </div>
                  <div className="pt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsHelpOpen(false)}
                      className="border-[#80c8f0] text-[#80c8f0] hover:bg-[#80c8f0]/10"
                    >
                      Got it, let's start!
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {/* Tail for speech bubble */}
            <div className="absolute -bottom-3 left-8 h-0 w-0 border-t-[12px] border-t-[#1A1F2C] border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent drop-shadow" />
          </div>
        </div>
      )}

      {/* Version Dialog */}
      <Dialog open={isCommitDialogOpen} onOpenChange={setIsCommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Version</DialogTitle>
            <DialogDescription>
              Save the current state of your RFX specifications
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="commitMessage">Version Message *</Label>
              <Input
                id="commitMessage"
                placeholder="e.g., Updated technical requirements"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsCommitDialogOpen(false)}
              disabled={isCreatingVersion}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCommit}
              disabled={!commitMessage.trim() || isCreatingVersion}
              className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
            >
              {isCreatingVersion && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View and restore previous versions of your RFX specifications
            </DialogDescription>
          </DialogHeader>

          {/* Create Version Button */}
          <div className="mb-4">
            <Button
              onClick={() => {
                console.log('🔵 [Create Version Button] baseCommitInfo:', baseCommitInfo);
                console.log('🔵 [Create Version Button] Button disabled:', baseCommitInfo.baseCommit !== null && !baseCommitInfo.hasUncommittedChanges);
                setIsCommitDialogOpen(true);
              }}
              disabled={baseCommitInfo.baseCommit !== null && !baseCommitInfo.hasUncommittedChanges}
              className="w-full bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4 mr-2" />
              {commits.length === 0 ? 'Create First Version' : 'Create Version'}
              {baseCommitInfo.baseCommit !== null && !baseCommitInfo.hasUncommittedChanges && (
                <span className="ml-2 text-xs opacity-70">(No changes to save)</span>
              )}
            </Button>
          </div>

          <ScrollArea className="h-[60vh] pr-4">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A1F2C]"></div>
              </div>
            ) : commits.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No versions yet. Create your first version to start tracking changes.
              </div>
            ) : (
              <div className="space-y-4">
                {commits.map((commit, index) => {
                  const previousCommit = getPreviousCommit(index);
                  const isBaseCommit = baseCommitInfo.baseCommitId === commit.id;
                  const isSentCommit = sentCommitId === commit.id;
                  return (
                    <Card 
                      key={commit.id} 
                      className={`border-l-4 ${
                        isSentCommit 
                          ? 'border-l-[#7de19a] bg-green-50/50' 
                          : isBaseCommit 
                          ? 'border-l-blue-500 bg-blue-50/50' 
                          : 'border-l-[#80c8f0]'
                      }`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-lg">{commit.commit_message}</CardTitle>
                              {isSentCommit && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#7de19a] text-black border border-[#7de19a]">
                                  📤 Sent to suppliers
                                </span>
                              )}
                              {isBaseCommit && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                  {baseCommitInfo.hasUncommittedChanges ? '📝 Current base' : '✅ Current'}
                                </span>
                              )}
                            </div>
                            <CardDescription>
                              By {getUserDisplayName(commit)} •{' '}
                              {format(new Date(commit.committed_at), 'MMM dd, yyyy HH:mm')}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewCommit(commit)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleRestoreCommit(commit.id)}
                              className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {previousCommit && (
                        <CardContent>
                          <div className="text-sm text-gray-600">
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <div>
                                <span className="font-medium">Description:</span>{' '}
                                {getDiff(commit.description, previousCommit.description)}
                              </div>
                              <div>
                                <span className="font-medium">Technical:</span>{' '}
                                {getDiff(commit.technical_requirements, previousCommit.technical_requirements)}
                              </div>
                              <div>
                                <span className="font-medium">Company:</span>{' '}
                                {getDiff(commit.company_requirements, previousCommit.company_requirements)}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <span className="font-medium">Timeline:</span>{' '}
                                {getJsonDiff(commit.timeline, previousCommit.timeline)}
                              </div>
                              <div>
                                <span className="font-medium">Images:</span>{' '}
                                {getJsonDiff(commit.images, previousCommit.images)}
                              </div>
                              <div>
                                <span className="font-medium">PDF Custom:</span>{' '}
                                {getJsonDiff(commit.pdf_customization, previousCommit.pdf_customization)}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* View Commit Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{selectedCommit?.commit_message}</DialogTitle>
              {selectedCommit && sentCommitId === selectedCommit.id && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#7de19a] text-black border border-[#7de19a]">
                  📤 Sent to suppliers
                </span>
              )}
            </div>
            <DialogDescription>
              By {selectedCommit && getUserDisplayName(selectedCommit)} •{' '}
              {selectedCommit && format(new Date(selectedCommit.committed_at), 'MMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>
          {selectedCommit && (
            <Tabs defaultValue="content" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="diff">Differences</TabsTrigger>
              </TabsList>
              <TabsContent value="content" className="space-y-4">
                <ScrollArea className="h-[70vh]">
                  <div className="space-y-4 pr-4">
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <div className="bg-gray-50 p-3 rounded-md text-sm whitespace-pre-wrap">
                        {selectedCommit.description || <span className="text-gray-400">No content</span>}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Technical Requirements</h4>
                      <div className="bg-gray-50 p-3 rounded-md text-sm whitespace-pre-wrap">
                        {selectedCommit.technical_requirements || <span className="text-gray-400">No content</span>}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Company Requirements</h4>
                      <div className="bg-gray-50 p-3 rounded-md text-sm whitespace-pre-wrap">
                        {selectedCommit.company_requirements || <span className="text-gray-400">No content</span>}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Timeline</h4>
                      <div className="bg-gray-50 p-3 rounded-md">
                        {formatTimeline(selectedCommit.timeline)}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Images</h4>
                      <div className="bg-gray-50 p-3 rounded-md">
                        {formatImages(selectedCommit.images)}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">PDF Customization</h4>
                      <div className="bg-gray-50 p-3 rounded-md">
                        {formatPdfCustomization(selectedCommit.pdf_customization)}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="diff" className="space-y-4">
                <ScrollArea className="h-[70vh]">
                  {(() => {
                    const commitIndex = commits.findIndex(c => c.id === selectedCommit.id);
                    const previousCommit = getPreviousCommit(commitIndex);
                    
                    if (!previousCommit) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          This is the first version. No previous version to compare.
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4 pr-4">
                        <div>
                          <h4 className="font-medium mb-2">Description: {getDiff(selectedCommit.description, previousCommit.description)}</h4>
                          {selectedCommit.description !== previousCommit.description && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Previous</p>
                                <div className="bg-red-50 border border-red-200 p-2 rounded text-sm whitespace-pre-wrap">
                                  {previousCommit.description || <span className="text-gray-400">Empty</span>}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Current</p>
                                <div className="bg-green-50 border border-green-200 p-2 rounded text-sm whitespace-pre-wrap">
                                  {selectedCommit.description || <span className="text-gray-400">Empty</span>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Technical: {getDiff(selectedCommit.technical_requirements, previousCommit.technical_requirements)}</h4>
                          {selectedCommit.technical_requirements !== previousCommit.technical_requirements && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Previous</p>
                                <div className="bg-red-50 border border-red-200 p-2 rounded text-sm whitespace-pre-wrap">
                                  {previousCommit.technical_requirements || <span className="text-gray-400">Empty</span>}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Current</p>
                                <div className="bg-green-50 border border-green-200 p-2 rounded text-sm whitespace-pre-wrap">
                                  {selectedCommit.technical_requirements || <span className="text-gray-400">Empty</span>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Company: {getDiff(selectedCommit.company_requirements, previousCommit.company_requirements)}</h4>
                          {selectedCommit.company_requirements !== previousCommit.company_requirements && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Previous</p>
                                <div className="bg-red-50 border border-red-200 p-2 rounded text-sm whitespace-pre-wrap">
                                  {previousCommit.company_requirements || <span className="text-gray-400">Empty</span>}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Current</p>
                                <div className="bg-green-50 border border-green-200 p-2 rounded text-sm whitespace-pre-wrap">
                                  {selectedCommit.company_requirements || <span className="text-gray-400">Empty</span>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Timeline: {getJsonDiff(selectedCommit.timeline, previousCommit.timeline)}</h4>
                          {getJsonDiff(selectedCommit.timeline, previousCommit.timeline) !== 'No changes' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Previous</p>
                                <div className="bg-red-50 border border-red-200 p-2 rounded">
                                  {formatTimeline(previousCommit.timeline)}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Current</p>
                                <div className="bg-green-50 border border-green-200 p-2 rounded">
                                  {formatTimeline(selectedCommit.timeline)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">Images: {getJsonDiff(selectedCommit.images, previousCommit.images)}</h4>
                          {getJsonDiff(selectedCommit.images, previousCommit.images) !== 'No changes' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Previous</p>
                                <div className="bg-red-50 border border-red-200 p-2 rounded">
                                  {formatImages(previousCommit.images)}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Current</p>
                                <div className="bg-green-50 border border-green-200 p-2 rounded">
                                  {formatImages(selectedCommit.images)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium mb-2">PDF Customization: {getJsonDiff(selectedCommit.pdf_customization, previousCommit.pdf_customization)}</h4>
                          {getJsonDiff(selectedCommit.pdf_customization, previousCommit.pdf_customization) !== 'No changes' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Previous</p>
                                <div className="bg-red-50 border border-red-200 p-2 rounded">
                                  {formatPdfCustomization(previousCommit.pdf_customization)}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Current</p>
                                <div className="bg-green-50 border border-green-200 p-2 rounded">
                                  {formatPdfCustomization(selectedCommit.pdf_customization)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RFXVersionControl;

