import styles from "./ChatPanel.module.css";

const buildIframeSrc = (streamingUrl: string, jwtToken: string): string => {
  try {
    const url = new URL(streamingUrl);
    url.searchParams.set("token", jwtToken);
    return url.toString();
  } catch {
    // Fallback: best-effort string concat
    const hasQuery = streamingUrl.includes("?");
    const sep = hasQuery ? "&" : "?";
    return `${streamingUrl}${sep}token=${encodeURIComponent(jwtToken)}`;
  }
};

export type PixelStreamingPanelProps = {
  isLiveMode: boolean;
  licenseId: string;
  streamingUrl: string;
  pixelStatus: "idle" | "loading" | "loaded" | "error";
  onLoaded: () => void;
  jwtToken: string | null;
};

export function PixelStreamingPanel({
  isLiveMode,
  licenseId,
  streamingUrl,
  pixelStatus,
  jwtToken,
  onLoaded,
}: PixelStreamingPanelProps) {
  if (!isLiveMode || !licenseId || !streamingUrl || !jwtToken) return null;

  return (
    <div className={styles.pixelStreamingWrap}>
      <div className={styles.pixelStreamingHeader}>
        <div className={styles.pixelStreamingTitle}>Pixel Streaming</div>
        <a
          className={styles.pixelStreamingLink}
          href={buildIframeSrc(streamingUrl, jwtToken)}
          target="_blank"
          rel="noreferrer"
        >
          Open
        </a>
      </div>

      {pixelStatus === "loading" && (
        <div className={styles.pixelStreamingHint}>
          Loading…
          {/* If this stays black, the URL might be blocked from embedding
          (X-Frame-Options/CSP) or mixed-content. */}
        </div>
      )}

      <iframe
        key={`${licenseId}:${streamingUrl}:${jwtToken}`}
        title="Ravatar Pixel Streaming"
        src={buildIframeSrc(streamingUrl, jwtToken)}
        className={styles.pixelStreamingIframe}
        allow="camera; microphone; autoplay; fullscreen; clipboard-read; clipboard-write; pointer-lock; encrypted-media"
        allowFullScreen
        referrerPolicy="no-referrer"
        onLoad={onLoaded}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock"
      />
    </div>
  );
}
