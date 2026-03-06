import type { ChatMessage, MultimodalWebSocketMessage, MessageImage } from "@/types/chat";
import { messageQueue } from "@/utils/messageQueue";

// Chat configuration constants
export const CHAT_TEMPERATURE = 0.7;
export const CHAT_MAX_TOKENS = 800;

// WebSocket connection for local API
let ws: WebSocket | null = null;
// Current WebSocket URL (can be configured at runtime)
let websocketUrl = 'wss://web-production-8e58.up.railway.app/ws';
let messageQueue_ws: Array<{resolve: (value: any) => void, reject: (error: any) => void}> = [];
let messageId = 0;
let lastMessage: {messages: ChatMessage[], conversationId?: string} | null = null;
let lastConversationId: string | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Connection state management
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
let currentConnectionState: ConnectionState = 'disconnected';

// Callback global para mensajes entrantes
let onMessageCallback: ((data: any) => void) | null = null;
let onConnectionStatusCallback: ((status: ConnectionState) => void) | null = null;

// Streaming state management
let streamingText = '';
let isStreaming = false;
let preambleText = '';
let isPreambleStreaming = false;
let currentMessageType = 'unknown'; // 'preamble' or 'content'
let hasReceivedFirstWord = false;
let detectionBuffer = ''; // Buffer to accumulate text until message type is determined
let preambleMessageCount = 0; // Track number of preamble messages
let hasSentFirstPreambleContent = false; // Track if content has been sent for the current preamble message
let hasSentStreamingFinal = false; // Track if we've already sent the final streaming message
let hasReceivedContent = false; // Track if we've received any actual content (not empty data)

// Smart connection management
let heartbeatInterval: NodeJS.Timeout | null = null;
let connectionAttemptTimestamp = 0;
let manualDisconnection = false;

export function setOnChatMessage(callback: (data: any) => void) {
  onMessageCallback = callback;
}

export function setOnConnectionStatus(callback: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
  onConnectionStatusCallback = callback;
}

// Function to reset preamble state when switching conversations
export function resetPreambleState() {
  // Reset all preamble-related variables
  streamingText = '';
  isStreaming = false;
  preambleText = '';
  isPreambleStreaming = false;
  currentMessageType = 'unknown';
  hasReceivedFirstWord = false;
  detectionBuffer = '';
  preambleMessageCount = 0;
  hasSentFirstPreambleContent = false;
  hasSentStreamingFinal = false;
  hasReceivedContent = false;
}

export function closeWebSocket() {
  // Set manual disconnection flag
  manualDisconnection = true;
  
  // Clear message queue
  messageQueue_ws.forEach(({ reject }) => {
    reject(new Error('WebSocket connection closed by user'));
  });
  messageQueue_ws = [];
  
  // Clear last message to prevent reconnection attempts
  lastMessage = null;
  lastConversationId = null;
  reconnectAttempts = 0;
  
  // Clear heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  // Reset preamble state when closing WebSocket
  resetPreambleState();
  
  // Close WebSocket if it exists
  if (ws) {
    // Remove all event listeners to prevent automatic reconnection
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    
    // Close the connection
    ws.close(1000, 'User requested close');
    ws = null;
  }
  
}

// Allow runtime configuration of the WebSocket URL (used by dev tools)
export function setWebSocketUrl(url: string) {
  websocketUrl = url;
}

function getWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    if (ws && ws.readyState === WebSocket.CONNECTING) {
      // Wait for connection
      ws.onopen = () => resolve(ws!);
      ws.onerror = (error) => reject(error);
      return;
    }

    // Create new connection using the configured URL
    ws = new WebSocket(websocketUrl);
    
    ws.onopen = () => {
      reconnectAttempts = 0; // Reset on successful connection
      
      if (onConnectionStatusCallback) {
        onConnectionStatusCallback('connected');
      }
      
      resolve(ws!);
    };

    ws.onerror = (error) => {
      reject(error);
    };

    ws.onclose = (event) => {
      ws = null;
      
      if (onConnectionStatusCallback) {
        onConnectionStatusCallback('disconnected');
      }
      
      // Only attempt reconnection if it was an unexpected close and we have a conversation to reconnect to
      if (event.code !== 1000 && lastConversationId && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        
        if (onConnectionStatusCallback) {
          onConnectionStatusCallback('reconnecting');
        }
        
        setTimeout(async () => {
          try {
            await reconnectToConversation();
          } catch (error) {
            console.error('Reconnection failed:', error);
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              // Reset for future attempts
              reconnectAttempts = 0;
              lastConversationId = null;
            }
          }
        }, 2000 * reconnectAttempts); // Exponential backoff
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Filtrar mensajes intermediate_step
        if (data.type === 'intermediate_step') {
          return; // No procesar mensajes intermediate_step
        }
        
        // Handle streaming text with new preamble detection logic
        if (data.type === 'text_stream') {
          
          // Handle empty data - only treat as termination if we've received content
          if (data.data === '') {
            
            // If we haven't received any content yet, ignore empty data (likely initial empty messages)
            if (!hasReceivedContent) {
              return;
            }
            
            
            // Send final message based on current type (only if we have content)
            if (currentMessageType === 'preamble' && preambleText && hasSentFirstPreambleContent) {
              // Remove PREAMBLE keyword from final message
              const finalPreambleText = preambleText.replace(/^PREAMBLE\s*/, '');
              if (onMessageCallback) {
                onMessageCallback({
                  type: 'preamble_final',
                  data: finalPreambleText,
                  preambleMessageIndex: preambleMessageCount - 1 // 0-based index
                });
              }
            } else if (currentMessageType === 'content' && streamingText && !hasSentStreamingFinal) {
              if (onMessageCallback) {
                onMessageCallback({
                  type: 'streaming_final',
                  data: streamingText
                });
                hasSentStreamingFinal = true; // Mark that we've sent the final streaming message
              }
            } else {
            }
            
            // Reset state for next message when we receive empty data (after content)
            // This ensures we can detect new message types (preamble vs content)
            if (!hasSentStreamingFinal && currentMessageType !== 'content') {
              // Reset state for next message
              currentMessageType = 'unknown';
              hasReceivedFirstWord = false;
              detectionBuffer = '';
              preambleText = '';
              streamingText = '';
              isPreambleStreaming = false;
              isStreaming = false;
              hasSentFirstPreambleContent = false; // Reset for next preamble message
              hasReceivedContent = false; // Reset content flag for next message
              // Don't reset preambleMessageCount - keep it for the entire conversation
            } else if (hasSentStreamingFinal) {
              // Reset state for next message
              currentMessageType = 'unknown';
              hasReceivedFirstWord = false;
              detectionBuffer = '';
              preambleText = '';
              streamingText = '';
              isPreambleStreaming = false;
              isStreaming = false;
              hasSentFirstPreambleContent = false; // Reset for next preamble message
              hasReceivedContent = false; // Reset content flag for next message
              // DON'T reset hasSentStreamingFinal here - keep it true until text message arrives
            } else if (currentMessageType === 'content' && !hasSentStreamingFinal) {
              // Reset state for next message even if it was content type
              currentMessageType = 'unknown';
              hasReceivedFirstWord = false;
              detectionBuffer = '';
              preambleText = '';
              streamingText = '';
              isPreambleStreaming = false;
              isStreaming = false;
              hasSentFirstPreambleContent = false; // Reset for next preamble message
              hasReceivedContent = false; // Reset content flag for next message
            }
            return;
          }
          
          // Mark that we've received actual content (not empty)
          if (!hasReceivedContent) {
            hasReceivedContent = true;
          }
          
          // Accumulate text in detection buffer
          detectionBuffer += data.data;
        
          
          // Detect message type on first word (only if not already detected)
          if (!hasReceivedFirstWord) {
            const trimmedBuffer = detectionBuffer.trim();
            
            // Check if it starts with PREAMBLE (even if incomplete)
            if (trimmedBuffer.startsWith('PREAMBLE') || trimmedBuffer === 'PREAMBLE') {
              currentMessageType = 'preamble';
              hasReceivedFirstWord = true;
              // Initialize preamble text with the detection buffer
              preambleText = detectionBuffer;
              // Don't increment count yet - wait for actual content
            } else if (trimmedBuffer.startsWith('PRE') && trimmedBuffer.length < 8) {
              // Still building PREAMBLE, wait for more characters
              return; // Don't send any updates until we know the type
            } else if (trimmedBuffer.length > 0 && !trimmedBuffer.startsWith('PRE')) {
              currentMessageType = 'content';
              hasReceivedFirstWord = true;
              // Initialize streaming text with the detection buffer
              streamingText = detectionBuffer;
            } else {
              
              // Still waiting for more text to determine type
              return; // Don't send any updates until we know the type
            }
          }
          
          // Check if we're starting a new PREAMBLE message (after a previous one ended)
          if (currentMessageType === 'unknown' && detectionBuffer.trim().startsWith('PREAMBLE')) {
            currentMessageType = 'preamble';
            hasReceivedFirstWord = true;
            preambleText = detectionBuffer;
          }
          
          // Update appropriate text buffer (only if type is determined)
          if (currentMessageType === 'preamble') {
            preambleText = detectionBuffer;
            isPreambleStreaming = true;
            
            // Remove PREAMBLE keyword from display
            const displayText = preambleText.replace(/^PREAMBLE\s*/, '');
            
            // Only send updates if there's actual content after PREAMBLE
            if (displayText.trim().length > 0) {
              // Increment count only when we have actual content
              if (!hasSentFirstPreambleContent) {
                preambleMessageCount++;
                hasSentFirstPreambleContent = true;
                
              }
              
              // Send preamble streaming update to callback
              if (onMessageCallback) {
                
                onMessageCallback({
                  type: 'preamble_streaming_update',
                  data: displayText,
                  isPreambleStreaming: true,
                  preambleMessageIndex: preambleMessageCount - 1 // 0-based index
                });
              } else {
              }
            } else {
            }
          } else if (currentMessageType === 'content') {
            streamingText = detectionBuffer;
            isStreaming = true;
            
            // Send streaming update to callback
            if (onMessageCallback) {
              onMessageCallback({
                type: 'streaming_update',
                data: streamingText,
                isStreaming: true
              });
            }
          }
          return;
        }
        
        // Handle final text message (end of stream)
        if (data.type === 'text') {         
          isStreaming = false;
          streamingText = ''; // Reset for next message
          detectionBuffer = ''; // Reset detection buffer
          
          // Always send text message to callback to ensure thinking state is reset
          if (onMessageCallback) {
            onMessageCallback(data);
          }
          
          // Reset hasSentStreamingFinal for the next message sequence
          hasSentStreamingFinal = false;
          hasReceivedContent = false;
          
          // Process as normal response
          const responseContent = data.data;
          const pendingMessage = messageQueue_ws.shift();
          if (pendingMessage) {
            pendingMessage.resolve({
              choices: [{
                message: {
                  content: responseContent
                }
              }]
            });
          }
          return;
        }
        
        // Handle other message types (legacy protocol)
        if (onMessageCallback) {
          
          try {
            onMessageCallback(data);
            
          } catch (error) {
            console.error('Error calling onMessageCallback:', error);
          }
        } else {
        }
        
        let responseContent = null;
        // Compatibilidad con ambos protocolos
        if (data.response) {
          // Protocolo antiguo
          responseContent = data.response;
        } else if (data.type && data.data) {
          // Protocolo nuevo (web de pruebas)
          switch (data.type) {
            case "text_intermediate":
              responseContent = `[Progreso] ${data.data}`;
              break;
            case "tool_result":
              responseContent = `[Resultado herramienta] ${JSON.stringify(data.data)}`;
              break;
            case "get_evaluation_tools_preamble_lookup":
              
              // This message type is handled directly by the UI, no text conversion needed
              responseContent = null;
              break;
            default:
              responseContent = JSON.stringify(data);
          }
        } else if (data.error) {
          const pendingMessage = messageQueue_ws.shift();
          if (pendingMessage) {
            pendingMessage.reject(new Error(data.error));
          }
          return;
        }
        
        if (responseContent !== null) {
          const pendingMessage = messageQueue_ws.shift();
          if (pendingMessage) {
            pendingMessage.resolve({
              choices: [{
                message: {
                  content: responseContent
                }
              }]
            });
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  });
}

async function reconnectToConversation() {
  if (!lastConversationId) {
    throw new Error('No conversation ID to reconnect to');
  }
  
  
  const socket = await getWebSocket();
  
  // Only send conversation ID to reconnect, no message retry
  const msg = { type: 'conversation_id', conversation_id: lastConversationId };
  socket.send(JSON.stringify(msg));
  
  // Reset preamble message count and streaming final flag for reconnection
  preambleMessageCount = 0;
  hasSentStreamingFinal = false;
  hasReceivedContent = false;
}

async function retryLastMessage() {
  if (!lastMessage) {
    throw new Error('No message to retry');
  }
  
  
  return sendChat(lastMessage.messages, lastMessage.conversationId);
}

export async function sendChat(messages: ChatMessage[], conversationId?: string) {
  try {
    // Store the message for potential retry
    lastMessage = { messages, conversationId };
    
    // Store conversation ID for reconnection purposes
    if (conversationId) {
      lastConversationId = conversationId;
    }
    
    const socket = await getWebSocket();
    
    // Get the last user message
    const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    // Send conversation ID first, then the message
    return new Promise((resolve, reject) => {
      messageQueue_ws.push({ resolve, reject });
      
      // Send conversation ID immediately after connection
      if (conversationId) {
        const msg = { type: 'conversation_id', conversation_id: conversationId };
        socket.send(JSON.stringify(msg));
        
        // Reset preamble message count and streaming final flag for new conversation
        preambleMessageCount = 0;
        hasSentStreamingFinal = false;
        hasReceivedContent = false;
      }
    
    // Then send the user message - check if it has images or documents for multimodal format
    if ((lastUserMessage.images && lastUserMessage.images.length > 0) || 
        (lastUserMessage.documents && lastUserMessage.documents.length > 0)) {
      // Send multimodal message
      const multimodalMsg: MultimodalWebSocketMessage = {
        type: 'multimodal_message',
        content: {
          text: typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '',
          images: lastUserMessage.images || [],
          documents: lastUserMessage.documents || []
        },
        metadata: {
          timestamp: new Date().toISOString(),
        }
      };
      socket.send(JSON.stringify(multimodalMsg));
    } else {
      // Send regular text message
      const msg = { type: 'message', message: lastUserMessage.content };
      socket.send(JSON.stringify(msg));
    }
    });

  } catch (err: any) {
    console.error("Error calling local API:", err);
    throw err;
  }
}
