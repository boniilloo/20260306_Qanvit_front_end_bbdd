
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChatMessage, CategorizedRecommendations } from '@/types/chat';
import { parseAssistantMessage } from '@/utils/supplierUtils';
import { getDocumentIcon, getDocumentTypeName, formatFileSize } from '@/utils/documentUtils';
import PropuestasCarousel from '@/components/ui/PropuestasCarousel';
import PropuestasMobileList from '@/components/ui/PropuestasMobileList';
import CompanyCarousel from '@/components/ui/CompanyCarousel';
import ProductInfoCard from '@/components/ui/ProductInfoCard';
import CompanyProfileCard from '@/components/ui/CompanyProfileCard';
import ProductProfileCard from '@/components/ui/ProductProfileCard';
import FileAttachment from './FileAttachment';
import EnhancedSupplierCard from './EnhancedSupplierCard';
import FQAvatar from './FQAvatar';
import SimpleImageModal from './SimpleImageModal';
import DocumentPreviewModal from './DocumentPreviewModal';
import { useAuth } from '@/contexts/AuthContext';
import AuthOverlay from '@/components/ui/AuthOverlay';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Brain } from 'lucide-react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { useIsMobile } from '@/hooks/use-mobile';
import ReasoningLookupContent from '@/components/ui/ReasoningLookupContent';
import EvaluationCarouselRenderer from './EvaluationCarouselRenderer';
import { EvaluationMessage } from '@/hooks/useEvaluationCarousel';

interface MessageRendererProps {
  message: ChatMessage;
  loading?: boolean;
  isLatest?: boolean;
  suppliers?: any[];
  conversationId?: string;
  carouselIndex?: number;
  isPublicExample?: boolean; // If true, allow unauthenticated users to view carousels
}

// Collapsible section component for categorized recommendations
interface CollapsibleSectionProps {
  title: string;
  count: number;
  user: any;
  children: React.ReactNode;
  isPublicExample?: boolean;
}

const CollapsibleSection = ({ title, count, user, children, isPublicExample = false }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <AuthOverlay 
        showOverlay={!user && !isPublicExample} 
        message="Sign in to view detailed supplier recommendations"
      >
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors group">
            <div className="flex items-center gap-3">
              <h4 className="text-lg font-semibold text-navy">{title}</h4>
              <span className="text-sm text-charcoal/60 bg-sky/10 px-2 py-1 rounded-full">
                {count} {count === 1 ? 'match' : 'matches'}
              </span>
            </div>
            <ChevronDown className={`h-5 w-5 text-charcoal/60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            {children}
          </CollapsibleContent>
        </Collapsible>
      </AuthOverlay>
    </div>
  );
};

const MessageRenderer = ({ message, loading, isLatest, suppliers = [], conversationId, carouselIndex = 1, isPublicExample = false }: MessageRendererProps) => {
  
  const { id: chatId } = useParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  
  // Use the passed conversationId or try to get it from URL params
  const currentConversationId = conversationId || chatId;

  // Helper function to extract text from various message formats
  const extractTextFromMessage = (data: any): string => {
    if (typeof data === 'string') {
      // Try to parse as JSON first to handle structured messages
      try {
        const parsed = JSON.parse(data);
        
        // Handle user_message format: {"type":"user_message","data":{"content":"..."}}
        if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
          return parsed.data.content;
        }
        // Handle assistant message array format: [{"type":"text","text":"..."}]
        else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'text' && parsed[0].text) {
          return parsed[0].text;
        }
        // Handle single text object: {"type":"text","text":"..."}
        else if (parsed.type === 'text' && parsed.text) {
          return parsed.text;
        }
        // If it's a string that's not JSON, use it as is
        else {
          return data;
        }
      } catch {
        // If parsing fails, use the string as is
        return data;
      }
    }
    
    if (Array.isArray(data)) {
      // Handle array format: [{"type":"text","text":"...","index":1}]
      const extractedText = data
        .filter(item => item && typeof item === 'object' && item.type === 'text' && item.text)
        .map(item => item.text)
        .join('');
      return extractedText;
    }
    
    if (data && typeof data === 'object') {
      // Handle object format: {"type":"text","text":"..."}
      if (data.type === 'text' && data.text) {
        return data.text;
      }
      // Handle MultimodalContent format: {"text":"...","images":[],"documents":[]}
      if (data.text && typeof data.text === 'string') {
        return data.text;
      }
    }
    
    // Fallback: convert to string
    return String(data);
  };

  // State for reasoning collapsible
  const [isReasoningOpen, setIsReasoningOpen] = useState(true);
  const [reasoningSteps, setReasoningSteps] = useState<(string | { type: string; data: any })[]>([]);
  
  // State for image modal
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // State for document modal
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);

  // Store active conversation ID for anonymous users
  useEffect(() => {
    if (currentConversationId && !user) {
      localStorage.setItem('active-conversation-id', currentConversationId);
    }
  }, [currentConversationId, user]);

  // Handle reasoning steps accumulation and auto-collapse
  useEffect(() => {
    if (message.preambleMessages && message.preambleMessages.length > 0) {
      // Use the preambleMessages array directly as steps
      setReasoningSteps(message.preambleMessages);
    } else if (message.preamble) {
      // Fallback to single preamble message
      setReasoningSteps([message.preamble]);
    }
    
    // Auto-collapse when content starts streaming or when explicitly requested
    if ((message.isStreaming && message.content && typeof message.content === 'string' && message.content.length > 0) || message.collapseReasoning) {
      // Delay the collapse slightly to show the content starting
      setTimeout(() => {
        setIsReasoningOpen(false);
      }, 500);
    }
  }, [message.preambleMessages, message.preamble, message.isPreambleStreaming, message.isStreaming, message.content, message.collapseReasoning]);

  // Handle image modal functions
  const handleImageClick = (index: number, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setSelectedImageIndex(index);
    setIsImageModalOpen(true);
  };

  const handleCloseImageModal = () => {
    setIsImageModalOpen(false);
  };

  const handleNavigateImage = (index: number) => {
    setSelectedImageIndex(index);
  };

  // Handle document modal functions
  const handleDocumentClick = (document: any) => {
    setSelectedDocument(document);
    setIsDocumentModalOpen(true);
  };

  const handleCloseDocumentModal = () => {
    setIsDocumentModalOpen(false);
    setSelectedDocument(null);
  };

  // TypingIndicator removed to allow streaming messages to display properly

  if (message.role === 'user') {
    return (
      <div id={message.id ? `message-${message.id}` : undefined} className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-6">
        <div className="flex justify-end">
          <div className="max-w-[75%] bg-[#22183a] text-white rounded-2xl px-5 py-4 shadow-sm border border-[#2d3748]">
            {/* Text content - don't show if it's just the _USER_IMAGE_ or _USER_DOCUMENT_ placeholder */}
            {message.content && message.content !== '_USER_IMAGE_' && message.content !== '_USER_DOCUMENT_' && (
              <p className="font-inter text-sm leading-relaxed whitespace-pre-wrap">
                {extractTextFromMessage(message.content)}
              </p>
            )}
            
            {/* Display images */}
            {message.images && message.images.length > 0 && (
              <div className={`${message.content && message.content !== '_USER_IMAGE_' && message.content !== '_USER_DOCUMENT_' ? 'mt-3' : ''} space-y-2`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {message.images.map((image, index) => (
                    <div key={index} className="relative group cursor-pointer" onClick={(e) => handleImageClick(index, e)}>
                      <img
                        src={image.data}
                        alt={image.filename}
                        className="w-full h-auto rounded-lg max-h-48 object-cover hover:opacity-90 transition-opacity"
                        onClick={(e) => handleImageClick(index, e)}
                      />
                      <div className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {image.filename}
                      </div>
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white bg-opacity-20 rounded-full p-2">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Display documents */}
            {message.documents && message.documents.length > 0 && (
              <div className={`${(message.content && message.content !== '_USER_IMAGE_' && message.content !== '_USER_DOCUMENT_') || (message.images && message.images.length > 0) ? 'mt-3' : ''} space-y-2`}>
                <div className="grid grid-cols-1 gap-2">
                  {message.documents.map((document, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => handleDocumentClick(document)}
                    >
                      <div className="text-2xl text-gray-600">
                        {getDocumentIcon(document.metadata.format)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-light italic text-gray-900 truncate">
                          {document.filename}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{getDocumentTypeName(document.metadata.format)}</span>
                        </div>
                      </div>
                      <div className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Display file attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-4 space-y-3">
                {message.attachments.map((attachment, index) => (
                  <FileAttachment
                    key={index}
                    file={attachment.file}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Image Modal for user messages */}
        {message.images && message.images.length > 0 && (
          <SimpleImageModal
            images={message.images}
            currentIndex={selectedImageIndex}
            isOpen={isImageModalOpen}
            onClose={handleCloseImageModal}
            onNavigate={handleNavigateImage}
          />
        )}

        {/* Document Modal for user messages */}
        {selectedDocument && (
          <DocumentPreviewModal
            document={selectedDocument}
            isOpen={isDocumentModalOpen}
            onClose={handleCloseDocumentModal}
          />
        )}
      </div>
    );
  }

  if (message.type === 'tool_get_evaluations_tool_result') {
    // Only show carousel when loaded from database (marked with fromDatabase flag)
    // Skip rendering when arriving via WebSocket to avoid duplicates
    if (message.fromDatabase && message.data && message.data.best_matches && Array.isArray(message.data.best_matches)) {
      // Function to map data to proposals for the card
      const mapToPropuestas = (arr: any[]) => {
        console.log('🔍 DEBUG: Raw data from Supabase:', arr);
        return (Array.isArray(arr) ? arr : []).map(item => {
          console.log('🔍 DEBUG: Individual item country_hq:', item.country_hq, 'Type:', typeof item.country_hq);
          return {
            id_company_revision: item.id_company_revision || '',
            id_product_revision: item.id_product_revision || '',
            empresa: item.empresa || '',
            website: item.website || '',
            producto: item.producto || '',
            product_website: item.product_website || '',
            match: item.match || 0,
            technical_match: item.technical_match ?? undefined,
            company_match: item.company_match ?? undefined,
            company_match_justification: item.company_match_justification || undefined,
            justification: item.justification || undefined,
            justification_sentence: item.justification_sentence || undefined,
            justification_pros: item.justification_pros || undefined,
            justification_cons: item.justification_cons || undefined,
            country_hq: item.country_hq || '',
          };
        });
      };

      // Get all best_matches and sort by match desc
      const allMatches = message.data.best_matches
        .slice()
        .sort((a: any, b: any) => Number(b?.match || 0) - Number(a?.match || 0));
      
      const bestMatches = mapToPropuestas(allMatches);

      const messageId = `conversation-${currentConversationId}-carousel-${carouselIndex}`;

      return (
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-8">
          <div className="flex items-start space-x-4">
            {!isMobile && <FQAvatar className="mt-1 shadow-sm flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <AuthOverlay 
                showOverlay={!user && !isPublicExample} 
                message="Sign in to view detailed supplier recommendations"
              >
                {isMobile ? (
                  <PropuestasMobileList 
                    propuestas={bestMatches}
                    title="Recommended Solutions"
                    subtitle="Based on technical and company match analysis"
                    conversationId={currentConversationId}
                    isPublicExample={isPublicExample}
                  />
                ) : (
                  <PropuestasCarousel 
                    propuestas={bestMatches}
                    title="Recommended Solutions"
                    subtitle="Based on technical and company match analysis"
                    conversationId={currentConversationId}
                    carouselId={messageId}
                    isPublicExample={isPublicExample}
                  />
                )}
              </AuthOverlay>
            </div>
          </div>
        </div>
      );
    } 
    
    // Skip rendering if no data (likely a WebSocket message)
    return null;
  }

  // Progressive evaluations: render the accumulating carousel for preamble evaluation updates
  if (message.type === 'get_evaluations_tool_preamble_evaluation' && message.data) {
    // Use the new reusable EvaluationCarouselRenderer component
    return (
      <EvaluationCarouselRenderer
        evaluationMessage={message as EvaluationMessage}
        conversationId={currentConversationId}
        carouselIndex={carouselIndex}
        isPublicExample={isPublicExample}
      />
    );
  }


  // Handle company revision lookup results - show full width profile card
  // DISABLED: Company cards rendering for tool_company_revision_lookup_result
  // if ((message.type === 'tool_company_revision_lookup_result' || 
  //      message.type === 'tool_result' || 
  //      message.type === 'company_lookup') && message.data) {
  //   // Parse the message content to extract additional information
  //   const parsed = parseAssistantMessage(message.content);
  //   let cleanContent = message.content;
  //   cleanContent = cleanContent.replace(/```suppliers_json\s*[\s\S]*?\s*```/gi, '').trim();
  //   
  //   return (
  //     <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mb-8">
  //       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  //         <div className="flex items-start gap-4">
  //           {!isMobile && <FQAvatar className="shadow-sm flex-shrink-0" />}
  //           <div className="flex-1">
  //             <CompanyProfileCard 
  //               company={message.data} 
  //               additionalInfo={{
  //                 description: cleanContent,
  //                 specifications: parsed.specifications,
  //                 questions: parsed.questions
  //               }}
  //             />
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  // Handle product revision lookup results - show aligned with conversation margins
  // DISABLED: Product cards rendering for tool_product_revision_lookup_result
  // if (message.type === 'tool_product_revision_lookup_result' && message.data) {
  //   // Parse the message content to extract additional information
  //   const parsed = parseAssistantMessage(message.content);
  //   let cleanContent = message.content;
  //   cleanContent = cleanContent.replace(/```suppliers_json\s*[\s\S]*?\s*```/gi, '').trim();
  //   
  //   return (
  //     <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-8">
  //       <div className="flex items-start space-x-4">
  //         {!isMobile && <FQAvatar className="mt-1 shadow-sm flex-shrink-0" />}
  //         <div className="flex-1 min-w-0">
  //           <ProductProfileCard 
  //             product={message.data} 
  //             company={message.data.company}
  //             additionalInfo={{
  //               description: cleanContent,
  //               specifications: parsed.specifications,
  //               questions: parsed.questions
  //             }}
  //           />
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  // Handle company evaluation tool results - show full width profile cards
  if (message.type === 'tool_get_company_evaluations_tool_result' && message.data) {
    // Parse the message content to extract additional information
    const parsed = parseAssistantMessage(typeof message.content === 'string' ? message.content : '');
    let cleanContent = message.content;
    if (typeof cleanContent === 'string') {
      cleanContent = cleanContent.replace(/```suppliers_json\s*[\s\S]*?\s*```/gi, '').trim();
    } else {
      // If content is not a string (e.g., array), convert to string or use empty string
      cleanContent = typeof cleanContent === 'object' ? JSON.stringify(cleanContent) : String(cleanContent || '');
    }
    
    return (
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CompanyProfileCard 
            company={message.data} 
            additionalInfo={{
              description: cleanContent,
              specifications: parsed.specifications,
              questions: parsed.questions
            }}
          />
        </div>
      </div>
    );
  }

  // Handle product evaluation tool results - show full width profile cards
  if (message.type === 'tool_get_product_evaluations_tool_result' && message.data) {
    // Parse the message content to extract additional information
    const parsed = parseAssistantMessage(typeof message.content === 'string' ? message.content : '');
    let cleanContent = message.content;
    if (typeof cleanContent === 'string') {
      cleanContent = cleanContent.replace(/```suppliers_json\s*[\s\S]*?\s*```/gi, '').trim();
    } else {
      // If content is not a string (e.g., array), convert to string or use empty string
      cleanContent = typeof cleanContent === 'object' ? JSON.stringify(cleanContent) : String(cleanContent || '');
    }
    
    return (
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProductProfileCard 
            product={message.data} 
            company={message.data.company}
            additionalInfo={{
              description: cleanContent,
              specifications: parsed.specifications,
              questions: parsed.questions
            }}
          />
        </div>
      </div>
    );
  }

  // Parse assistant message for proposals, specs, questions, etc.
  const parsed = parseAssistantMessage(typeof message.content === 'string' ? message.content : '');

  // Clean the message content to remove the suppliers_json block for display
  let cleanContent = message.content;
  if (typeof cleanContent === 'string') {
    cleanContent = cleanContent.replace(/```suppliers_json\s*[\s\S]*?\s*```/gi, '').trim();
  } else {
    // If content is not a string (e.g., array), convert to string or use empty string
    cleanContent = typeof cleanContent === 'object' ? JSON.stringify(cleanContent) : String(cleanContent || '');
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-8">
      {/* Reasoning (preamble) collapsible section */}
      {(message.preambleMessages && message.preambleMessages.length > 0) || message.preamble ? (
        <div className="mb-4">
          <div className="flex items-start gap-4">
            {!isMobile && <FQAvatar className="shadow-sm flex-shrink-0" />}
            <div className="max-w-[90%] sm:max-w-[75%]">
              <Collapsible open={isReasoningOpen} onOpenChange={setIsReasoningOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-blue-50 rounded-2xl border border-blue-200 hover:bg-blue-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Reasoning Process</span>
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                      {reasoningSteps.length} {reasoningSteps.length === 1 ? 'step' : 'steps'}
                    </span>
                    {message.isPreambleStreaming && (
                      <div className="flex gap-1">
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></div>
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-blue-600 transition-transform ${isReasoningOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <div className="space-y-3">
                      {reasoningSteps.map((step, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            {step === '...' ? (
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-blue-600 italic">Thinking</span>
                                <div className="flex gap-1">
                                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></div>
                                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                </div>
                              </div>
                            ) : typeof step === 'object' && step && 'type' in step && step.type === 'lookup' ? (
                              <ReasoningLookupContent data={(step as { type: string; data: any }).data} />
                            ) : typeof step === 'string' ? (
                              <p className="text-sm text-blue-800 leading-relaxed">
                                {step}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      ) : null}
      
      {/* Message container with improved spacing */}
      {cleanContent && (
        <div className="mb-6">
          <div className="flex items-start gap-4">
            {!isMobile && <FQAvatar className="shadow-sm flex-shrink-0" />}
            <div className="max-w-[90%] sm:max-w-[75%] bg-white rounded-2xl px-6 py-5 shadow-sm border border-gray-100">
              <MarkdownRenderer content={cleanContent} />

              

              
            </div>
          </div>
        </div>
      )}

      {/* Carousel container - proposals with better spacing */}
      {parsed.propuestas && parsed.propuestas.length > 0 && (
        <div className="mb-8">
          <div className="flex items-start gap-4">
            {!isMobile && <FQAvatar className="shadow-sm flex-shrink-0" />}
            <div className="flex-1">
              <AuthOverlay 
                showOverlay={!user && !isPublicExample} 
                message="Sign in to view detailed supplier recommendations"
              >
                {isMobile ? (
                  <PropuestasMobileList 
                    propuestas={parsed.propuestas} 
                    title="Recommended Solutions"
                    subtitle="Based on technical and company match analysis"
                    conversationId={currentConversationId}
                    isPublicExample={isPublicExample}
                  />
                ) : (
                  <PropuestasCarousel 
                    propuestas={parsed.propuestas} 
                    title="Recommended Solutions"
                    conversationId={currentConversationId}
                    carouselId={`conversation-${currentConversationId}-carousel-${carouselIndex}`}
                    isPublicExample={isPublicExample}
                  />
                )}
              </AuthOverlay>
            </div>
          </div>
        </div>
      )}

      {/* Carousel container - suppliers with improved spacing */}
      {suppliers && suppliers.length > 0 && (
        <div className="mb-8">
          <div className="flex items-start gap-4">
            {!isMobile && <FQAvatar className="shadow-sm flex-shrink-0" />}
            <div className="flex-1 space-y-6">
              <AuthOverlay 
                showOverlay={!user && !isPublicExample} 
                message="Sign in to view and interact with supplier recommendations"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-[#f4a9aa] to-[#f4a9aa] rounded-lg flex items-center justify-center text-white text-sm font-bold">
                      {suppliers.length}
                    </div>
                    Machine Vision Suppliers Found
                  </h4>
                  <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    Rate each supplier 👍👎
                  </span>
                </div>
                
                {/* Supplier cards in horizontal 3x2 matrix layout */}
                <div className="overflow-x-auto pb-4">
                  <div className="grid grid-rows-2 grid-flow-col gap-4 auto-cols-[400px] min-w-[1200px]">
                    {suppliers.map((supplier, index) => (
                      <div 
                        key={supplier.id || index} 
                        className="animate-fade-in"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <EnhancedSupplierCard 
                          supplier={supplier} 
                          conversationId={currentConversationId}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Feedback encouragement with better spacing */}
                <div className="text-center py-5 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                  <p className="text-sm text-gray-700 mb-2 font-medium">
                    💡 Help improve recommendations
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Your feedback on each supplier helps our AI learn and provide better matches for future searches
                  </p>
                </div>
              </AuthOverlay>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {message.images && message.images.length > 0 && (
        <SimpleImageModal
          images={message.images}
          currentIndex={selectedImageIndex}
          isOpen={isImageModalOpen}
          onClose={handleCloseImageModal}
          onNavigate={handleNavigateImage}
        />
      )}

      {/* Document Modal */}
      {selectedDocument && (
        <DocumentPreviewModal
          document={selectedDocument}
          isOpen={isDocumentModalOpen}
          onClose={handleCloseDocumentModal}
        />
      )}
    </div>
  );
};

export default MessageRenderer;
