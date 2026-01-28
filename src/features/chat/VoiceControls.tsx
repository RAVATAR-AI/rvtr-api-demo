// src/features/chat/VoiceControls.tsx
import styles from "./ChatPanel.module.css";

export type VoiceMode = "record" | "pushToTalk" | "vad";
export type VadState = "idle" | "speech" | "silence";
export type WsStatus = "disconnected" | "connecting" | "connected" | "error";

export type VoiceControlsProps = {
  isLiveMode: boolean;
  licenseId: string;
  isRecording: boolean;
  wsStatus: WsStatus;
  voiceMode: VoiceMode;
  vadState: VadState;

  onChangeVoiceMode: (mode: VoiceMode) => void;

  // Record → Stop → Send
  onStartRecording: () => void;
  onStopRecording: () => void;

  // Push-to-talk
  onPTTStart: () => void;
  onPTTEnd: () => void;
};

export function VoiceControls({
  isLiveMode,
  licenseId,
  isRecording,
  wsStatus,
  voiceMode,
  vadState,
  onChangeVoiceMode,
  onStartRecording,
  onStopRecording,
  onPTTStart,
  onPTTEnd,
}: VoiceControlsProps) {
  if (!isLiveMode || !licenseId) return null;

  return (
    <div className={styles.voiceRow}>
      <div className={styles.voiceModeRow}>
        <label className={styles.voiceModeLabel}>
          <input
            type="radio"
            name="voiceMode"
            checked={voiceMode === "record"}
            onChange={() => onChangeVoiceMode("record")}
          />
          Record → Stop → Send
        </label>
        <br />

        <label className={styles.voiceModeLabel}>
          <input
            type="radio"
            name="voiceMode"
            checked={voiceMode === "pushToTalk"}
            onChange={() => onChangeVoiceMode("pushToTalk")}
          />
          Push-to-talk
        </label>
        <br />

        <label className={styles.voiceModeLabel}>
          <input
            type="radio"
            name="voiceMode"
            checked={voiceMode === "vad"}
            onChange={() => onChangeVoiceMode("vad")}
          />
          VAD auto-stop
        </label>
        <br />
      </div>

      {voiceMode === "record" ? (
        !isRecording ? (
          <button
            onClick={onStartRecording}
            disabled={wsStatus !== "connected"}
            className={`${styles.liveButton} ${styles.liveStart}`}
            title="Start recording (Live Mode)"
          >
            Start Recording
          </button>
        ) : (
          <button
            onClick={onStopRecording}
            className={`${styles.liveButton} ${styles.liveStop}`}
            title="Stop recording and send"
          >
            Stop Recording
          </button>
        )
      ) : voiceMode === "pushToTalk" ? (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onPTTStart();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            onPTTEnd();
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            onPTTEnd();
          }}
          onPointerLeave={(e) => {
            if (isRecording) {
              e.preventDefault();
              onPTTEnd();
            }
          }}
          // prevents “tap” click from triggering anything (PTT should be pointer-hold driven)
          onClick={() => {}}
          disabled={wsStatus !== "connected"}
          className={`${styles.liveButton} ${
            isRecording ? styles.liveStop : styles.liveStart
          }`}
          title="Hold to talk"
        >
          {isRecording ? "Recording… release to send" : "Hold to talk"}
        </button>
      ) : null}

      {voiceMode === "vad" && (
        <div
          className={
            vadState === "speech"
              ? styles.vadSpeaking
              : vadState === "silence"
                ? styles.vadSilence
                : styles.vadIdle
          }
        >
          {vadState === "speech"
            ? "🟠 Speaking…"
            : vadState === "silence"
              ? "🟢 Silence"
              : "⚪ VAD idle"}
        </div>
      )}

      <div className={styles.voiceHint}>
        {voiceMode === "record"
          ? "Live voice: record → stop → send."
          : voiceMode === "pushToTalk"
            ? "Live voice: hold → speak → release → send."
            : "VAD: just speak. When you pause, it auto-sends."}
      </div>
    </div>
  );
}
