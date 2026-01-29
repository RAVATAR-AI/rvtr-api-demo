// JWT Response
export interface JWTResponse {
  token: string;
}

// Connection Response
export interface Avatar {
  id: string;
  name: string;
  description?: string;
}

export interface Language {
  code: string;
  name: string;
}

export interface ConnectionResponse {
  avatars_info: Avatar[];
  languages: Language[];
  session?: string;
}

// WebSocket Message Types
export interface OutgoingTextMessage {
  isLive: boolean;
  chat_type: "text";
  requestType: "text";
  avatar_id: string;
  user_id: string;
  language: string;
  source: string;
  session?: string;
}

export interface IncomingMessage {
  type: "system" | "incoming" | "event";
  content: string;
  fileUrl?: string;
  timestamp?: string;
}

export interface AvatarConfig {
  avatar_id: string;
  voice_id?: string;
}

// Chat History Types
export type ChatHistoryDirection = "incoming" | "outgoing";
export type ChatHistoryChatType = "text" | "voice" | "video";

export interface ChatHistoryMessage {
  _id: string;
  direction: ChatHistoryDirection;
  user_id: string;
  request: string;
  answer?: string;
  avatar_id: string;
  avatar_name?: string;
  date: number; // unix timestamp (ms)
  chat_type: ChatHistoryChatType;
  language_code: string;
  fileUrl?: string;
}

export interface ChatHistoryResponse {
  payload: ChatHistoryMessage[];
  has_more_messages: boolean;
}

// UI Types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  // Optional metadata (present for voice/live messages, may be absent for system/history UI items)
  requestType?: "audio" | "text";
  chat_type?: ChatHistoryChatType;
  fileUrl?: string;
  isHistory?: boolean;
}
