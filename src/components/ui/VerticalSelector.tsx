import React, { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import PromptLibraryModal from '@/components/ui/PromptLibraryModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { VERTICALS } from '@/data/verticals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface VerticalSelectorProps {
  showPromptLibrary?: boolean;
}

export default function VerticalSelector({ showPromptLibrary = false }: VerticalSelectorProps) {
  const [showPromptLibraryModal, setShowPromptLibraryModal] = useState(false);
  const [showAllVerticals, setShowAllVerticals] = useState(false);
  const isMobile = useIsMobile();

  const marqueeItems = useMemo(() => [...VERTICALS, ...VERTICALS], []);

  return (
    <div className="w-full bg-white border-b border-gray-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Hide label on mobile to maximize horizontal space */}
          {!isMobile && (
            <div className="flex items-center gap-3 shrink-0">
              <h2 className="text-sm font-semibold text-[#22183a]">Verticals</h2>
              <div className="h-6 w-px bg-gray-200" />
            </div>
          )}

          {/* Horizontal mini-cards (auto-scroll) */}
          <div className="flex-1 min-w-0">
            <div className="relative overflow-hidden">
              {/* Edge fade */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent z-10" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent z-10" />

              <div className="group">
                <div className="flex items-center gap-3 w-max pr-2 animate-[verticals-header-marquee_40s_linear_infinite]">
                  {marqueeItems.map((vertical, idx) => {
                    const Icon = vertical.Icon;

                    return (
                      <div
                        key={`${vertical.id}-${idx}`}
                        className={[
                          'shrink-0 text-left select-none',
                          'bg-white rounded-xl border',
                          'border-gray-200/70',
                          'px-4 py-3',
                          'w-[200px] sm:w-[220px]',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-gray-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-extrabold tracking-wide text-[#22183a] uppercase leading-snug">
                              {vertical.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Dialog open={showAllVerticals} onOpenChange={setShowAllVerticals}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllVerticals(true)}
                className="text-[#22183a] border-[#f4a9aa] hover:bg-[#f4a9aa]/10"
              >
                View all verticals
              </Button>

              <DialogContent className="max-w-6xl w-[95vw] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-[#22183a]">All verticals</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {VERTICALS.map((vertical) => {
                    const Icon = vertical.Icon;

                    return (
                      <div
                        key={vertical.id}
                        className={[
                          'bg-white rounded-2xl border border-gray-200/70',
                          'shadow-sm',
                          'px-6 py-5',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5 text-gray-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-extrabold tracking-wide text-[#22183a] uppercase leading-snug">
                              {vertical.name}
                            </div>
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-gray-500">{vertical.region}</span>
                              {vertical.focusTag && (
                                <span className="inline-flex items-center rounded-full border border-[#f4a9aa]/40 bg-[#f4a9aa]/10 px-2 py-0.5 text-xs font-medium text-[#22183a]">
                                  {vertical.focusTag}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>

            {showPromptLibrary && (
              <Button
                variant="outline"
                size={isMobile ? "icon" : "sm"}
                onClick={() => setShowPromptLibraryModal(true)}
                className={`flex items-center gap-2 text-[#22183a] border-[#f4a9aa] hover:bg-[#f4a9aa]/10 ${isMobile ? 'w-9 h-9' : ''}`}
                title={isMobile ? "Prompt Library" : ""}
              >
                <BookOpen className="w-4 h-4" />
                {!isMobile && "Prompt Library"}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {showPromptLibrary && (
        <PromptLibraryModal
          open={showPromptLibraryModal}
          onOpenChange={setShowPromptLibraryModal}
        />
      )}
    </div>
  );
}