import { RavatarApiError, NetworkError } from "./errors";

const DEBUG = true;

// Retry configuration constants
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;

const RETRYABLE_STATUS_CODES = new Set([503, 504]);
const AUTH_EXPIRED_STATUS_CODE = 403;
const PAYMENT_REQUIRED_STATUS_CODE = 402;

export interface HttpClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  refreshJwt?: () => Promise<string>;
}

export class HttpClient {
  private config: HttpClientConfig;
  private jwtToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(config: HttpClientConfig) {
    // Default timeout is 30s
    const timeoutMs = config.timeoutMs ?? 30000;

    this.config = {
      ...config,
      timeoutMs,
    };
  }

  setJwtToken(token: string | null): void {
    this.jwtToken = token;
    if (DEBUG) console.debug("JWT token updated:", token ? "set" : "cleared");
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Use JWT token if available, otherwise use API key
    const token = this.jwtToken ?? this.config.apiKey ?? null;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    return headers;
  }

  private async refreshToken(): Promise<string> {
    if (!this.config.refreshJwt) {
      throw new RavatarApiError(
        "JWT expired and no refreshJwt handler provided",
        AUTH_EXPIRED_STATUS_CODE,
      );
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.config
        .refreshJwt()
        .then((newToken) => {
          this.setJwtToken(newToken);
          return newToken;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>("GET", endpoint);
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, data);
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>("PUT", endpoint, data);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>("DELETE", endpoint);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    data?: unknown,
    retryCount = 0,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = this.buildHeaders();

    if (DEBUG) {
      console.debug(`HTTP ${method} ${url}`, data ? { data } : "");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const hasBody =
        data !== undefined && method !== "GET" && method !== "HEAD";

      const response = await fetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Attempt to parse JSON only when present/expected
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      const parseJsonSafely = async (): Promise<unknown> => {
        if (!isJson) return {};
        try {
          return await response.json();
        } catch {
          return {};
        }
      };

      if (!response.ok) {
        const errorData = await parseJsonSafely();

        if (DEBUG) {
          console.debug(`HTTP ${response.status} error:`, errorData);
        }

        // 403: JWT expired → refresh token and retry once
        if (response.status === AUTH_EXPIRED_STATUS_CODE) {
          if (retryCount === 0) {
            if (DEBUG) console.debug("JWT expired. Refreshing token...");
            await this.refreshToken();
            return this.request<T>(method, endpoint, data, retryCount + 1);
          }

          throw new RavatarApiError(
            "Authentication failed after token refresh.",
            response.status,
            errorData,
          );
        }

        // 402: Payment Required
        if (response.status === PAYMENT_REQUIRED_STATUS_CODE) {
          throw new RavatarApiError(
            "Payment required. Please check your account balance.",
            response.status,
            errorData,
          );
        }

        // 503/504: Retry with exponential backoff
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          if (retryCount < MAX_RETRY_ATTEMPTS) {
            const delay = Math.pow(2, retryCount) * BASE_RETRY_DELAY_MS;
            if (DEBUG) {
              console.debug(
                `Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`,
              );
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this.request<T>(method, endpoint, data, retryCount + 1);
          }

          throw new RavatarApiError(
            "Service temporarily unavailable. Please try again later.",
            response.status,
            errorData,
          );
        }

        throw new RavatarApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData,
        );
      }

      // Success
      if (!isJson) {
        // If API returns non-JSON on success, return an empty object as T
        // (keeps client from crashing while caller can still handle it)
        return {} as T;
      }

      const result = (await response.json()) as T;
      if (DEBUG) {
        console.debug(`HTTP ${method} ${url} success:`, result);
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof RavatarApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new NetworkError("Request timeout", error);
      }

      throw new NetworkError("Network request failed", error);
    }
  }
}
