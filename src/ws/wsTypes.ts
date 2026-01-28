import type { OutgoingTextMessage, IncomingMessage } from '../types/ravatar';

export type WsMessageType = 
  | 'connection'
  | 'message'
  | 'response'
  | 'error'
  | 'close';

export interface WsMessage {
  type: WsMessageType;
  data?: unknown;
  error?: string;
  timestamp: string;
}

export interface WsConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export type WsEventHandler = (message: WsMessage) => void;
export type WsErrorHandler = (error: Event) => void;
export type WsCloseHandler = () => void;

// Re-export Ravatar-specific message types
export type { OutgoingTextMessage, IncomingMessage };
