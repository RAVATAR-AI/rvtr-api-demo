import styles from "./ChatPanel.module.css";

type WsStatus = "disconnected" | "connecting" | "connected" | "error";
type LiveStatus = "idle" | "starting" | "live" | "stopping" | "error";

interface ChatHeaderBarProps {
  wsStatus: WsStatus;
  isLiveMode: boolean;
  licenseId: string;
  liveStatus: LiveStatus;

  canConnect: boolean;
  jwtToken: string;
  avatarId: string;

  onConnect: () => void;
  onStartLive: () => void;
  onStopLive: () => void;
}

const getStatusColor = (wsStatus: WsStatus) => {
  switch (wsStatus) {
    case "connected":
      return "🟢";
    case "connecting":
      return "🟡";
    case "error":
      return "🔴";
    default:
      return "⚪";
  }
};

export function ChatHeaderBar({
  wsStatus,
  isLiveMode,
  licenseId,
  liveStatus,
  canConnect,
  jwtToken,
  avatarId,
  onConnect,
  onStartLive,
  onStopLive,
}: ChatHeaderBarProps) {
  return (
    <div className={styles.statusBar}>
      <div className={styles.status}>
        WebSocket: {getStatusColor(wsStatus)} {wsStatus}
        {isLiveMode && licenseId ? " • Live mode: ✅" : null}
      </div>

      <div className={styles.actions}>
        <button
          onClick={onConnect}
          disabled={!canConnect && wsStatus === "disconnected"}
          className={`${styles.connectButton} ${
            wsStatus === "connected" ? styles.disconnectButton : ""
          }`}
        >
          {wsStatus === "connected"
            ? "Disconnect WS"
            : wsStatus === "connecting"
              ? "Connecting..."
              : "Connect WS"}
        </button>

        {!isLiveMode ? (
          <button
            onClick={onStartLive}
            disabled={
              liveStatus === "starting" ||
              wsStatus !== "connected" ||
              !jwtToken ||
              !avatarId
            }
            className={`${styles.liveButton} ${styles.liveStart}`}
            title="Start Live session"
          >
            {liveStatus === "starting" ? "Starting Live..." : "Start Live mode"}
          </button>
        ) : (
          <button
            onClick={onStopLive}
            disabled={liveStatus === "stopping" || !licenseId}
            className={`${styles.liveButton} ${styles.liveStop}`}
            title="End Live session"
          >
            {liveStatus === "stopping" ? "Stopping..." : "Stop Live mode"}
          </button>
        )}
      </div>
    </div>
  );
}
