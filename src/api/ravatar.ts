import type {
  JWTResponse,
  ConnectionResponse,
  ChatHistoryResponse,
} from "../types/ravatar";

const DEBUG = true;

export class RavatarApi {
  private baseUrl: string;
  private jwtToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async startLiveSession(avatarId: string) {
    const res = await fetch(`${this.baseUrl}/startLiveSession`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.jwtToken}`,
      },
      body: JSON.stringify({
        avatar_id: avatarId,
        width: "1280",
        height: "720",
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to start live session");
    }

    return res.json(); // { LicenseId, streamingUrl }
  }

  async endLiveSession(licenseId: string) {
    await fetch(`${this.baseUrl}/endLiveSession`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.jwtToken}`,
      },
      body: JSON.stringify({ LicenseId: licenseId }),
      keepalive: true,
    });
  }

  /**
   * Get JWT token for authentication
   * POST /jwt
   */
  async getJWT(params: { userId: string; projectId: string }): Promise<string> {
    if (DEBUG) console.debug("Getting JWT token...", params);

    const res = await fetch(`${this.baseUrl}/jwt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: params.userId,
        project_id: params.projectId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`JWT request failed (${res.status}): ${text}`);
    }

    const data: JWTResponse & { jwt?: string } = await res.json();
    const token = data.jwt || data.token;

    if (!token) {
      throw new Error("JWT token not found in response");
    }

    this.jwtToken = token;

    if (DEBUG) console.debug("JWT token received:", token);
    return token;
  }

  /**
   * Get connection information including avatars, languages, and session
   * GET /connection
   */
  async getConnection(): Promise<ConnectionResponse> {
    if (!this.jwtToken) {
      throw new Error("JWT token is not set. Call getJWT() first.");
    }

    if (DEBUG) console.debug("Getting connection data...");

    const res = await fetch(`${this.baseUrl}/connection`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Connection request failed (${res.status}): ${text}`);
    }

    const data: ConnectionResponse = await res.json();

    if (DEBUG)
      console.debug("Connection data received:", {
        avatars: data.avatars_info?.length,
        languages: data.languages?.length,
        hasSession: !!data.session,
      });

    return data;
  }

  /**
   * Get chat history for a user
   * GET /chat
   */
  async getChatHistory(params: {
    userId: string;
    perPage?: number;
    page?: number;
  }): Promise<ChatHistoryResponse> {
    if (!this.jwtToken) {
      throw new Error("JWT token is not set. Call getJWT() first.");
    }

    const perPage = params.perPage ?? 100;
    const page = params.page ?? 1;

    if (DEBUG)
      console.debug("Getting chat history...", {
        userId: params.userId,
        perPage,
        page,
      });

    const qs = new URLSearchParams({
      user_id: params.userId,
      per_page: String(perPage),
      page: String(page),
    });

    const res = await fetch(`${this.baseUrl}/chat?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat history request failed (${res.status}): ${text}`);
    }

    const data: ChatHistoryResponse = await res.json();

    if (DEBUG)
      console.debug("Chat history received:", {
        count: data.payload?.length ?? 0,
        hasMore: !!data.has_more_messages,
      });

    return data;
  }

  /**
   * Manually update JWT token (optional)
   */
  setJwtToken(token: string | null): void {
    this.jwtToken = token;
  }
}
