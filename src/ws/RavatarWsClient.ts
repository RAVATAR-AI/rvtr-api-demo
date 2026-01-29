import type {
  WsConfig,
  WsMessage,
  WsEventHandler,
  WsErrorHandler,
  WsCloseHandler,
} from "./wsTypes";

const DEBUG = true;

export class RavatarWsClient {
  private ws: WebSocket | null = null;
  private config: Required<WsConfig>;
  private reconnectCount = 0;
  private messageHandlers: Set<WsEventHandler> = new Set();
  private errorHandlers: Set<WsErrorHandler> = new Set();
  private closeHandlers: Set<WsCloseHandler> = new Set();
  private shouldReconnect = true;

  constructor(config: WsConfig) {
    this.config = {
      reconnectAttempts: 3,
      reconnectDelay: 2000,
      ...config,
    };
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (DEBUG) console.debug("WebSocket already connected");
      return;
    }

    try {
      if (DEBUG) console.debug("Connecting to WebSocket:", this.config.url);
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.reconnectCount = 0;
        if (DEBUG) console.debug("WebSocket connected");
        this.emit({
          type: "connection",
          data: { status: "connected" },
          timestamp: new Date().toISOString(),
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (DEBUG) console.debug("WebSocket message received:", data);
          this.emit({
            type: "message",
            data,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        if (DEBUG) console.debug("WebSocket error:", error);
        this.errorHandlers.forEach((handler) => handler(error));
      };

      this.ws.onclose = (event) => {
        if (DEBUG) console.debug("WebSocket closed:", event.code, event.reason);
        this.emit({
          type: "close",
          timestamp: new Date().toISOString(),
        });

        if (
          this.shouldReconnect &&
          this.reconnectCount < this.config.reconnectAttempts
        ) {
          this.reconnectCount++;
          const delay = this.config.reconnectDelay;
          if (DEBUG) {
            console.debug(
              `Reconnecting in ${delay}ms (attempt ${this.reconnectCount}/${this.config.reconnectAttempts})`,
            );
          }
          setTimeout(() => this.connect(), delay);
        } else {
          this.closeHandlers.forEach((handler) => handler());
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
    }
  }

  disconnect(): void {
    if (DEBUG) console.debug("Disconnecting WebSocket");
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data);
      if (DEBUG) console.debug("Sending WebSocket message:", data);
      this.ws.send(message);
    } else {
      console.warn("WebSocket is not connected");
    }
  }

  onMessage(handler: WsEventHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: WsErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onClose(handler: WsCloseHandler): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  private emit(message: WsMessage): void {
    this.messageHandlers.forEach((handler) => handler(message));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
