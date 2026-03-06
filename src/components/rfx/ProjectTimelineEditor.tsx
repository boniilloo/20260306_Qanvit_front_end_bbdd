import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Calendar, ArrowRight, Eye, GripVertical, RotateCcw, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as DayCalendar } from '@/components/ui/calendar';
import { format, addDays, addWeeks, addMonths, addYears, parseISO, startOfMonth, endOfMonth, differenceInMonths } from 'date-fns';
import { generateUUID } from '@/utils/uuidUtils';

export type TimelineUnit = 'days' | 'weeks' | 'months' | 'years';

export type TimelineDate =
  | { type: 'absolute'; date: string } // ISO string
  | { type: 'relative'; amount: number; unit: TimelineUnit; from: 'rfq_launch' | 'previous' };

export interface TimelineMilestone {
  id: string;
  label: string;
  key: string; // stable key for predefined milestones
  date: TimelineDate;
}

interface ProjectTimelineEditorProps {
  milestones: TimelineMilestone[];
  onChange: (milestones: TimelineMilestone[]) => void;
  rfqLaunchDate?: string | null; // optional absolute RFQ launch date for relative calc
  readOnly?: boolean; // if true, component is read-only (no editing, no action buttons except calendar view)
}

const predefined: Array<Pick<TimelineMilestone, 'key' | 'label'>> = [
  { key: 'rfx_launch', label: 'RFX launch' },
  { key: 'suppliers_acceptance_deadline', label: 'Suppliers acceptance deadline' },
  { key: 'quotation_submission_deadline', label: 'Quotation submission deadline' },
  { key: 'project_start', label: 'Project start' },
  { key: 'installation_beginning', label: 'On-site system installation begins' },
  { key: 'tests_start', label: 'Testing and validation begins' },
  { key: 'project_end', label: 'Project completion' },
];

function computeAbsoluteDate(index: number, items: TimelineMilestone[], rfqLaunchDate?: string | null): Date | null {
  const item = items[index];
  if (!item) return null;
  if (item.date.type === 'absolute') {
    try { return parseISO(item.date.date); } catch { return null; }
  }
  const fromDate = item.date.from === 'rfq_launch'
    ? (rfqLaunchDate ? parseISO(rfqLaunchDate) : null)
    : computeAbsoluteDate(index - 1, items, rfqLaunchDate);
  if (!fromDate) return null;
  const { amount, unit } = item.date;
  switch (unit) {
    case 'days': return addDays(fromDate, amount);
    case 'weeks': return addWeeks(fromDate, amount);
    case 'months': return addMonths(fromDate, amount);
    case 'years': return addYears(fromDate, amount);
  }
}

// Color palette for milestones (vibrant, distinguishable colors)
const MILESTONE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
];

export default function ProjectTimelineEditor({ milestones, onChange, rfqLaunchDate, readOnly = false }: ProjectTimelineEditorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  const resolvedDates = useMemo(() => milestones.map((_, i) => computeAbsoluteDate(i, milestones, rfqLaunchDate)), [milestones, rfqLaunchDate]);
  const selectedDates = useMemo(() => resolvedDates.filter((d): d is Date => !!d), [resolvedDates]);
  const minDate = useMemo(() => selectedDates.length ? selectedDates.reduce((a, b) => (a < b ? a : b)) : null, [selectedDates]);
  const maxDate = useMemo(() => selectedDates.length ? selectedDates.reduce((a, b) => (a > b ? a : b)) : null, [selectedDates]);
  const baseMonth = useMemo(() => (minDate ? startOfMonth(minDate) : startOfMonth(new Date())), [minDate]);
  const numMonths = useMemo(() => {
    if (!minDate || !maxDate) return 1;
    return differenceInMonths(endOfMonth(maxDate), startOfMonth(minDate)) + 1;
  }, [minDate, maxDate]);

  const labelsByDate = useMemo(() => {
    const map = new Map<string, string[]>();
    milestones.forEach((m, idx) => {
      const d = resolvedDates[idx];
      if (!d) return;
      const key = format(d, 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(m.label);
      map.set(key, arr);
    });
    return map;
  }, [milestones, resolvedDates]);

  const colorByDate = useMemo(() => {
    const map = new Map<string, string>();
    milestones.forEach((m, idx) => {
      const d = resolvedDates[idx];
      if (!d) return;
      const key = format(d, 'yyyy-MM-dd');
      // First milestone on a date defines the color
      if (!map.has(key)) {
        map.set(key, MILESTONE_COLORS[idx % MILESTONE_COLORS.length]);
      }
    });
    return map;
  }, [milestones, resolvedDates]);

  const [hoverInfo, setHoverInfo] = React.useState<{ date: Date; labels: string[] } | null>(null);

  const allMonths = useMemo(() => {
    const months: Date[] = [];
    const count = Math.min(Math.max(numMonths, 1), 36);
    for (let i = 0; i < count; i++) {
      months.push(addMonths(baseMonth, i));
    }
    return months;
  }, [baseMonth, numMonths]);

  const updateMilestone = (idx: number, update: Partial<TimelineMilestone>) => {
    const next = [...milestones];
    next[idx] = { ...next[idx], ...update } as TimelineMilestone;
    onChange(next);
  };

  const updateDate = (idx: number, date: TimelineDate) => updateMilestone(idx, { date });

  const addMilestone = () => {
    const id = generateUUID();
    onChange([
      ...milestones,
      { id, label: 'New milestone', key: `custom_${id}`, date: { type: 'relative', amount: 2, unit: 'weeks', from: 'previous' } },
    ]);
  };

  const removeMilestone = (idx: number) => {
    const next = milestones.filter((_, i) => i !== idx);
    onChange(next);
  };

  const handleDragStart = (idx: number) => {
    setDraggedIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIndex(idx);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const next = [...milestones];
      const [removed] = next.splice(draggedIndex, 1);
      next.splice(dragOverIndex, 0, removed);
      onChange(next);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const getDefaultMilestones = (): TimelineMilestone[] => {
    const todayPlusTwoWeeks = addDays(new Date(), 14);
    return [
      {
        id: generateUUID(),
        label: 'RFX launch',
        key: 'rfx_launch',
        date: { type: 'absolute', date: format(todayPlusTwoWeeks, 'yyyy-MM-dd') },
      },
      {
        id: generateUUID(),
        label: 'Suppliers acceptance deadline',
        key: 'suppliers_acceptance_deadline',
        date: { type: 'relative', amount: 1, unit: 'weeks', from: 'previous' },
      },
      {
        id: generateUUID(),
        label: 'Quotation submission deadline',
        key: 'quotation_submission_deadline',
        date: { type: 'relative', amount: 3, unit: 'weeks', from: 'previous' },
      },
      {
        id: generateUUID(),
        label: 'Project start',
        key: 'project_start',
        date: { type: 'relative', amount: 1, unit: 'months', from: 'previous' },
      },
      {
        id: generateUUID(),
        label: 'On-site system installation begins',
        key: 'installation_beginning',
        date: { type: 'relative', amount: 6, unit: 'months', from: 'previous' },
      },
      {
        id: generateUUID(),
        label: 'Testing and validation begins',
        key: 'tests_start',
        date: { type: 'relative', amount: 2, unit: 'weeks', from: 'previous' },
      },
      {
        id: generateUUID(),
        label: 'Project completion',
        key: 'project_end',
        date: { type: 'relative', amount: 4, unit: 'months', from: 'previous' },
      },
    ];
  };

  const makePredefinedIfMissing = () => {
    if (milestones.length > 0) return; // do not override
    onChange(getDefaultMilestones());
  };

  // Render calendar content (reusable for modal)
  const renderCalendar = () => (
    <>
      <style>
        {milestones.map((m, idx) => {
          const d = resolvedDates[idx];
          if (!d) return '';
          const dateKey = format(d, 'yyyy-MM-dd');
          const color = MILESTONE_COLORS[idx % MILESTONE_COLORS.length];
          const labels = labelsByDate.get(dateKey) || [];
          const labelText = labels.join(', ');
          
          return `
            .milestone-${dateKey.replace(/\-/g, '')} {
              background-color: ${color} !important;
              color: white !important;
              font-weight: 600;
              position: relative;
            }
            .milestone-${dateKey.replace(/\-/g, '')}:hover {
              opacity: 0.9 !important;
            }
            .milestone-${dateKey.replace(/\-/g, '')}::after {
              content: "${labelText}";
              position: absolute;
              bottom: 100%;
              left: 50%;
              transform: translateX(-50%) translateY(-8px);
              background-color: rgba(0, 0, 0, 0.9);
              color: white;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 500;
              white-space: nowrap;
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.15s ease-in-out;
              z-index: 1000;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }
            .milestone-${dateKey.replace(/\-/g, '')}:hover::after {
              opacity: 1;
            }
          `;
        }).join('\n')}
      </style>
      
      {/* Legend */}
      <div className="mb-4 pb-4 border-b">
        <div className="text-xs font-medium text-gray-600 mb-2">Legend</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {milestones.map((m, idx) => {
            const d = resolvedDates[idx];
            if (!d) return null;
            const color = MILESTONE_COLORS[idx % MILESTONE_COLORS.length];
            return (
              <div key={m.id} className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-gray-700">{m.label} ({format(d, 'PP')})</span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {allMonths.map((m) => {
          const modifiers: Record<string, Date[]> = {};
          const modifiersClassNames: Record<string, string> = {};
          
          milestones.forEach((milestone, idx) => {
            const d = resolvedDates[idx];
            if (d) {
              const dateKey = format(d, 'yyyy-MM-dd').replace(/\-/g, '');
              modifiers[`milestone-${dateKey}`] = [d];
              modifiersClassNames[`milestone-${dateKey}`] = `milestone-${dateKey}`;
            }
          });
          
          return (
            <DayCalendar
              key={m.toISOString()}
              mode="multiple"
              month={m}
              numberOfMonths={1}
              selected={selectedDates}
              showOutsideDays
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              onDayMouseEnter={(date) => {
                const key = format(date, 'yyyy-MM-dd');
                const labels = labelsByDate.get(key) || [];
                setHoverInfo(labels.length ? { date, labels } : null);
              }}
              onDayMouseLeave={() => setHoverInfo(null)}
            />
          );
        })}
      </div>
      {hoverInfo && (
        <div className="mt-2 text-sm text-gray-700">
          <span className="font-medium">{format(hoverInfo.date, 'PPP')}:</span> {hoverInfo.labels.join(', ')}
        </div>
      )}
    </>
  );

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  return (
    <div className="space-y-4">
      {/* Top action buttons */}
      <div className="flex items-center justify-between">
        {!readOnly && (
          <div className="flex gap-2">
            {/* Restore default milestones */}
            <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore defaults
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Restore default milestones?</DialogTitle>
                  <DialogDescription>
                    This will replace all current milestones with the default ones. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      onChange(getDefaultMilestones());
                      setShowRestoreDialog(false);
                    }}
                  >
                    Restore defaults
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Clear all milestones */}
            {milestones.length > 0 && (
              <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Eraser className="w-4 h-4 mr-2" />
                    Clear all
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Clear all milestones?</DialogTitle>
                    <DialogDescription>
                      This will remove all milestones from the timeline. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowClearDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => {
                        onChange([]);
                        setShowClearDialog(false);
                      }}
                    >
                      Clear all
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}

        {/* Calendar view button */}
        {selectedDates.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="bg-[#80c8f0] hover:bg-[#80c8f0]/90 text-white border-[#80c8f0]">
                <Eye className="w-4 h-4 mr-2" />
                View as calendar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Project Timeline Calendar</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                {renderCalendar()}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!readOnly && milestones.length === 0 && (
        <Button type="button" variant="outline" onClick={makePredefinedIfMissing}>
          <Calendar className="w-4 h-4 mr-2" />
          Add default milestones
        </Button>
      )}

      {readOnly ? (
        <div className="space-y-3">
          {milestones.map((m, idx) => {
            const abs = resolvedDates[idx];
            return (
              <div
                key={m.id}
                className="border border-gray-200 rounded-lg shadow-sm bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#80c8f0] text-white flex items-center justify-center text-xs font-semibold">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-black">{m.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {abs ? format(abs, 'PPP') : 'Date not computed'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Accordion type="multiple" className="w-full space-y-3">
          {milestones.map((m, idx) => {
            const abs = resolvedDates[idx];
            const isDragging = draggedIndex === idx;
            const isDragOver = dragOverIndex === idx;
            
            return (
              <div
                key={m.id}
                draggable={!readOnly}
                onDragStart={readOnly ? undefined : () => handleDragStart(idx)}
                onDragOver={readOnly ? undefined : (e) => handleDragOver(e, idx)}
                onDragEnd={readOnly ? undefined : handleDragEnd}
                onDragLeave={readOnly ? undefined : handleDragLeave}
                className={`transition-all ${
                  isDragging ? 'opacity-50 scale-95' : ''
                } ${
                  isDragOver ? 'border-blue-500 bg-blue-50 rounded-lg' : ''
                }`}
              >
                <AccordionItem value={m.id} className="border border-gray-200 rounded-lg shadow-sm bg-white">
                  <AccordionTrigger className="px-4 py-3 hover:bg-gray-50 hover:no-underline rounded-t-lg">
                    <div className="flex items-center gap-3 w-full pr-4">
                      <div 
                        className="cursor-move p-1 hover:bg-gray-100 rounded"
                        title="Drag to reorder"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-black">{m.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {abs ? format(abs, 'PPP') : 'Date not computed'}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4 pt-2">
                      {/* Title input */}
                      <div className="space-y-2">
                        <Label>Milestone title</Label>
                        <Input
                          value={m.label}
                          onChange={(e) => updateMilestone(idx, { label: e.target.value })}
                          placeholder="Milestone title"
                        />
                      </div>

                      {/* Date configuration */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Date type</Label>
                          <Select
                            value={m.date.type}
                            onValueChange={(val: 'absolute' | 'relative') => {
                              if (val === 'absolute') {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                // Use abs if it's valid and not in the past, otherwise use today
                                const defaultDate = abs && abs >= today ? abs : today;
                                updateDate(idx, { type: 'absolute', date: format(defaultDate, 'yyyy-MM-dd') });
                              } else {
                                updateDate(idx, { type: 'relative', amount: 2, unit: 'weeks', from: 'previous' });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="absolute">Absolute date</SelectItem>
                              <SelectItem value="relative">Relative to previous milestone</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {m.date.type === 'absolute' ? (
                          <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="justify-start w-full">
                                  <CalendarIcon className="w-4 h-4 mr-2" />
                                  {(() => {
                                    try { return format(parseISO(m.date.date), 'PPP'); } catch { return 'Pick a date'; }
                                  })()}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="p-0">
                                <DayCalendar
                                  mode="single"
                                  selected={(() => { try { return parseISO(m.date.date); } catch { return undefined; } })()}
                                  onSelect={(d) => d && updateDate(idx, { type: 'absolute', date: format(d, 'yyyy-MM-dd') })}
                                  disabled={(date) => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    return date < today;
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>Relative date</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min={0}
                                value={m.date.amount}
                                onChange={(e) => {
                                  if (m.date.type === 'relative') {
                                    updateDate(idx, { type: 'relative', amount: Number(e.target.value), unit: m.date.unit, from: 'previous' });
                                  }
                                }}
                              />
                              <Select
                                value={m.date.unit}
                                onValueChange={(val: TimelineUnit) => {
                                  if (m.date.type === 'relative') {
                                    updateDate(idx, { type: 'relative', amount: m.date.amount, unit: val, from: 'previous' });
                                  }
                                }}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="days">days</SelectItem>
                                  <SelectItem value="weeks">weeks</SelectItem>
                                  <SelectItem value="months">months</SelectItem>
                                  <SelectItem value="years">years</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      <div className="flex justify-end pt-2 border-t">
                        <Button 
                          type="button" 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => removeMilestone(idx)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete milestone
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </div>
            );
          })}
        </Accordion>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={addMilestone}>
            <Plus className="w-4 h-4 mr-2" />
            Add milestone
          </Button>
        </div>
      )}
    </div>
  );
}


