import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, ChevronDown, ChevronUp, Trash2, Calendar, Eye } from 'lucide-react';
import { RFXEvaluationResult } from '@/hooks/useRFXEvaluationResults';
import EvaluationCarouselRenderer from '@/components/chat/EvaluationCarouselRenderer';

interface EvaluationResultsHistoryProps {
  results: RFXEvaluationResult[];
  loading: boolean;
  onDeleteResult: (resultId: string) => void;
  onDeleteAllResults: () => void;
  rfxId: string;
  /** When true, renders history in read-only mode (no delete actions) */
  readOnly?: boolean;
}

const EvaluationResultsHistory: React.FC<EvaluationResultsHistoryProps> = ({
  results,
  loading,
  onDeleteResult,
  onDeleteAllResults,
  rfxId,
  readOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  const toggleResultExpanded = (resultId: string) => {
    setExpandedResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resultId)) {
        newSet.delete(resultId);
      } else {
        newSet.add(resultId);
      }
      return newSet;
    });
  };

  const handleDeleteClick = (resultId: string) => {
    setSelectedResultId(resultId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedResultId) {
      onDeleteResult(selectedResultId);
      setSelectedResultId(null);
    }
    setDeleteDialogOpen(false);
  };

  const handleDeleteAllConfirm = () => {
    onDeleteAllResults();
    setDeleteAllDialogOpen(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            <span className="text-sm text-gray-600">Loading evaluation history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return null; // Don't show anything if there are no results
  }

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-600" />
                  <span>Evaluation Results History</span>
                  <span className="text-sm font-normal text-gray-500">
                    ({results.length} result{results.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                )}
              </CardTitle>
              <CardDescription>
                View and manage previous evaluation results
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Delete All Button */}
              {!readOnly && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteAllDialogOpen(true)}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Delete All History
                  </Button>
                </div>
              )}

              {/* Results List */}
              <div className="space-y-3">
                {results.map((result, index) => {
                  const isExpanded = expandedResults.has(result.id);
                  const createdDate = new Date(result.created_at);
                  const formattedDate = createdDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  // Count number of evaluations
                  const evaluationCount = result.evaluation_data?.best_matches?.length || 0;

                  return (
                    <div key={result.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-4 bg-gray-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-900">
                              Result #{results.length - index}
                            </span>
                            <span className="text-xs text-gray-500">•</span>
                            <span className="text-xs text-gray-500">{formattedDate}</span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {evaluationCount} evaluation{evaluationCount !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleResultExpanded(result.id)}
                            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {isExpanded ? 'Hide' : 'View'}
                          </Button>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(result.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-gray-200">
                          {/* Render the evaluation carousel */}
                          <EvaluationCarouselRenderer
                            evaluationMessage={{
                              role: 'assistant',
                              content: '',
                              type: 'get_evaluations_tool_preamble_evaluation',
                              data: (() => {
                                try {
                                  // Parse the JSON string if evaluation_data is a string
                                  if (typeof result.evaluation_data === 'string') {
                                    return JSON.parse(result.evaluation_data);
                                  }
                                  // Return as-is if it's already an object
                                  return result.evaluation_data;
                                } catch (error) {
                                  console.error('❌ [EvaluationResultsHistory] Error parsing evaluation_data:', error);
                                  return result.evaluation_data;
                                }
                              })(),
                            }}
                            conversationId={rfxId}
                            carouselIndex={index + 1}
                            isPublicExample={readOnly}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {!readOnly && (
        <>
          {/* Delete Single Result Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Evaluation Result?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete this evaluation result from
                  your history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteConfirm}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete All Results Dialog */}
          <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete All Evaluation Results?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all {results.length}{' '}
                  evaluation result{results.length !== 1 ? 's' : ''} from your history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAllConfirm}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
};

export default EvaluationResultsHistory;

