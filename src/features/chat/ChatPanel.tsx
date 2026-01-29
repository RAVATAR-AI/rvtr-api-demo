import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MessageList } from "./MessageList";
import { RavatarWsClient } from "../../ws/RavatarWsClient";
import { RavatarApi } from "../../api/ravatar";
import { generateUUID, getUserId } from "../../utils/uuid";
import type {
  ChatHistoryMessage,
  ChatMessage,
  IncomingMessage,
  OutgoingTextMessage,
} from "../../types/ravatar";
import { VoiceControls } from "./VoiceControls";
import { PixelStreamingPanel } from "./PixelStreamingPanel";
import { ChatHeaderBar } from "./ChatHeaderBar";
import { ChatInputBar } from "./ChatInputBar";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  jwtToken: string;
  avatarId: string;
  language: string;
  sessionId?: string;
}

export function ChatPanel({
  jwtToken,
  avatarId,
  language,
  sessionId,
}: ChatPanelProps) {
  // Pixel Streaming iframe state for Live sessions
  const [streamingUrl, setStreamingUrl] = useState<string>("");
  const [pixelStatus, setPixelStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  const normalizeStreamingUrl = (url: string): string => {
    // Avoid mixed-content blocking when the app is served over https
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:"
    ) {
      return url.replace(/^http:\/\//i, "https://");
    }
    return url;
  };

  const canEmbedUrl = (url: string): boolean => {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  };

  // Everything rendered in MessageList (user/system/assistant)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");

  // Convert REST history payload into the UI message shape
  const mapHistoryItemToUiMessages = (
    item: ChatHistoryMessage,
  ): ChatMessage[] => {
    const ts = new Date(item.date).toISOString();
    const out: ChatMessage[] = [];

    // History often contains:
    // - outgoing item with request
    // - incoming item with answer (and it may repeat request)
    // Avoid duplicates: map request ONLY from outgoing; map answer ONLY from incoming.
    const direction = item.direction;

    if ((direction === "outgoing" || !direction) && item.request) {
      out.push({
        id: generateUUID(),
        role: "user",
        content: item.request,
        timestamp: ts,
        isHistory: true,
      });
    }

    if ((direction === "incoming" || !direction) && item.answer) {
      out.push({
        id: generateUUID(),
        role: "assistant",
        content: item.answer,
        timestamp: ts,
        fileUrl: item.fileUrl,
        isHistory: true,
      });
    }

    return out;
  };

  // Pull last N messages from REST API once we can authenticate
  const loadChatHistory = async () => {
    try {
      if (!jwtToken) return;

      const history = await api.getChatHistory({
        userId: userId.current,
        perPage: 50,
        page: 1,
      });

      const sorted = [...(history.payload ?? [])].sort(
        (a, b) => (a.date ?? 0) - (b.date ?? 0),
      );

      const uiMessages = sorted.flatMap(mapHistoryItemToUiMessages);

      setMessages(uiMessages);

      if (history.has_more_messages) {
        addSystemMessage("ℹ️ Loaded last 50 messages (more available)");
      } else {
        addSystemMessage("ℹ️ Loaded chat history");
      }
    } catch (e) {
      addSystemMessage(
        `❌ Failed to load chat history: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    }
  };
  const [wsStatus, setWsStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  // Live mode state
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<
    "idle" | "starting" | "live" | "stopping" | "error"
  >("idle");
  const [licenseId, setLicenseId] = useState<string>("");
  const licenseIdRef = useRef<string>("");

  // Voice for Live Mode
  const [voiceMode, setVoiceMode] = useState<"record" | "pushToTalk" | "vad">(
    "record",
  );
  // Refs to avoid stale-closure VAD restarts
  const voiceModeRef = useRef<"record" | "pushToTalk" | "vad">("record");
  const isLiveModeRef = useRef(false);
  const wsStatusRef = useRef<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const vadRestartTimeoutRef = useRef<number | null>(null);

  const [vadState, setVadState] = useState<"idle" | "speech" | "silence">(
    "idle",
  );
  const [isRecording, setIsRecording] = useState(false);
  const isPushToTalkRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  // Track how the current recording was started (so VAD auto-restart doesn't affect other modes)
  const recordingModeRef = useRef<"record" | "pushToTalk" | "vad" | null>(null);
  // Allow canceling a recording without sending
  const skipSendRef = useRef(false);

  // Push-to-talk: start recording only after user holds for a bit
  const MIN_PTT_HOLD_MS = 200;
  const pttTimerRef = useRef<number | null>(null);
  const pttDidStartRef = useRef(false);

  // Simple client-side VAD (voice activity detection): auto-stop after speech ends
  const VAD_SPEECH_THRESHOLD = 0.02; // RMS threshold (tune if needed)
  const VAD_SILENCE_MS = 900; // stop after this much silence
  const VAD_MAX_MS = 15000; // safety cap

  const vadRafRef = useRef<number | null>(null);
  const vadCtxRef = useRef<AudioContext | null>(null);
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const vadSpeechDetectedRef = useRef(false);
  const vadLastVoiceTsRef = useRef(0);
  const vadStartTsRef = useRef(0);

  // Audio playback for assistant voice replies
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Prevent queued auto-restarts when VAD mode toggles
  const cancelVadRestart = () => {
    if (vadRestartTimeoutRef.current != null) {
      window.clearTimeout(vadRestartTimeoutRef.current);
      vadRestartTimeoutRef.current = null;
    }
  };

  // Tear down analyser/AudioContext helpers used by VAD recordings
  const stopVad = () => {
    cancelVadRestart();
    setVadState("idle");
    if (vadRafRef.current != null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }

    vadSpeechDetectedRef.current = false;
    vadLastVoiceTsRef.current = 0;
    vadStartTsRef.current = 0;

    try {
      vadAnalyserRef.current?.disconnect();
    } catch {
      // ignore
    }
    vadAnalyserRef.current = null;
    vadDataRef.current = null;

    const ctx = vadCtxRef.current;
    vadCtxRef.current = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        // ignore
      }
    }
  };

  // Pause/rewind any currently playing assistant audio reply
  const stopAudio = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {
      // ignore
    }
  };

  // Fire-and-forget audio playback helper for assistant voice replies
  const playAudio = async (src: string) => {
    if (!src) return;
    try {
      stopAudio();
      const audio = new Audio(src);
      audioRef.current = audio;
      // iOS/Safari sometimes needs explicit load
      audio.load();
      await audio.play();
    } catch (e) {
      addSystemMessage(
        `🔇 Couldn't autoplay audio: ${e instanceof Error ? e.message : "blocked"}`,
      );
    }
  };

  useEffect(() => {
    licenseIdRef.current = licenseId;
  }, [licenseId]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    isLiveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  useEffect(() => {
    wsStatusRef.current = wsStatus;
  }, [wsStatus]);

  useEffect(() => {
    // If we are not in VAD anymore, make sure any pending auto-restart is cancelled.
    if (voiceMode !== "vad") {
      cancelVadRestart();
    }

    // VAD mode: start automatically (no buttons)
    if (
      voiceMode === "vad" &&
      isLiveMode &&
      wsStatus === "connected" &&
      Boolean(licenseId) &&
      !isRecording
    ) {
      void startRecording({ useVad: true, isPushToTalk: false });
      return;
    }

    // Leaving VAD should cancel current VAD recording (no send, no loop)
    if (
      voiceMode !== "vad" &&
      isRecording &&
      recordingModeRef.current === "vad"
    ) {
      cancelVadRestart();
      stopRecording({ send: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, isLiveMode, wsStatus, licenseId, isRecording]);

  const wsClientRef = useRef<RavatarWsClient | null>(null);
  const userId = useRef(getUserId());

  const apiBase = "https://chat.rvtr.ai".replace(/\/+$/, "");

  const api = useMemo(() => {
    const a = new RavatarApi(apiBase);
    a.setJwtToken(jwtToken || null);
    return a;
  }, [apiBase, jwtToken]);

  const canConnect = Boolean(jwtToken && avatarId && language);
  const canSend = wsStatus === "connected" && Boolean(inputValue.trim());

  useEffect(() => {
    // Hydrate UI with previous chat messages
    void loadChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwtToken]);

  useEffect(() => {
    return () => {
      cancelVadRestart();
      try {
        wsClientRef.current?.disconnect();
      } catch {
        // ignore
      }

      // Stop any playing audio
      stopAudio();
      stopVad();
      audioRef.current = null;

      try {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          skipSendRef.current = true;
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];

      const id = licenseIdRef.current;
      if (id) void api.endLiveSession(id);
      setStreamingUrl("");
      setPixelStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildWsUrl = () => {
    const wsEnv = "wss://chat.rvtr.ai/ws/chat";

    return `${wsEnv}?token=${encodeURIComponent(jwtToken)}`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read audio blob"));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unexpected FileReader result"));
          return;
        }
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(blob);
    });
  };

  const handleStartLive = async () => {
    if (wsStatus !== "connected") {
      addSystemMessage("Connect WebSocket first.");
      return;
    }

    if (!jwtToken || !avatarId) {
      addSystemMessage("Please complete settings first (JWT + Avatar)");
      return;
    }

    if (isLiveMode && licenseId) return;

    setLiveStatus("starting");
    addSystemMessage("Starting Live session...");

    try {
      const res = await api.startLiveSession(avatarId);

      setLicenseId(res.LicenseId);

      const nextUrl = res.streamingUrl
        ? normalizeStreamingUrl(res.streamingUrl)
        : "";
      setStreamingUrl(nextUrl);
      setPixelStatus(nextUrl ? "loading" : "idle");

      if (!nextUrl) {
        addSystemMessage(
          "ℹ️ Live session started, but streamingUrl is missing in response (Pixel Streaming iframe won't render).",
        );
      } else if (!canEmbedUrl(nextUrl)) {
        addSystemMessage(
          `⚠️ streamingUrl doesn't look like a valid http(s) URL: ${nextUrl}`,
        );
      } else if (
        typeof window !== "undefined" &&
        window.location.protocol === "https:" &&
        res.streamingUrl &&
        /^http:\/\//i.test(res.streamingUrl)
      ) {
        addSystemMessage(
          "ℹ️ streamingUrl was http:// while app is https:// — normalized to https:// to avoid mixed-content blocking.",
        );
      }

      setIsLiveMode(true);
      setLiveStatus("live");

      addSystemMessage("✅ Live session started");
    } catch (e) {
      setLiveStatus("error");
      addSystemMessage(
        `❌ Failed to start Live: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    }
  };

  const handleStopLive = async () => {
    setLiveStatus("stopping");
    addSystemMessage("Stopping Live session...");

    try {
      try {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          cancelVadRestart();
          skipSendRef.current = true;
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
      setIsRecording(false);

      if (licenseId) await api.endLiveSession(licenseId);
    } finally {
      setLicenseId("");
      setStreamingUrl("");
      setPixelStatus("idle");
      setIsLiveMode(false);
      setLiveStatus("idle");
      addSystemMessage("✅ Live session ended");
    }
  };

  const startRecording = async (opts?: {
    isPushToTalk?: boolean;
    useVad?: boolean;
  }) => {
    if (wsStatus !== "connected") {
      addSystemMessage("Connect WebSocket first.");
      return;
    }
    if (!isLiveMode || !licenseId) {
      addSystemMessage("Start Live session first.");
      return;
    }
    if (isRecording) return;
    isPushToTalkRef.current = Boolean(opts?.isPushToTalk);
    const useVad = Boolean(opts?.useVad);
    // remember how this recording was started
    recordingModeRef.current = useVad
      ? "vad"
      : isPushToTalkRef.current
        ? "pushToTalk"
        : "record";
    skipSendRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      // Start simple client-side VAD if requested
      stopVad();
      if (useVad) {
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;

          const ctx = new AudioCtx();
          vadCtxRef.current = ctx;

          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.2;

          source.connect(analyser);
          vadAnalyserRef.current = analyser;
          // Ensure the typed array is backed by an ArrayBuffer (not SharedArrayBuffer),
          // to satisfy the WebAudio lib typing for getFloatTimeDomainData.
          vadDataRef.current = new Float32Array(
            new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
          );

          vadSpeechDetectedRef.current = false;
          vadLastVoiceTsRef.current = 0;
          vadStartTsRef.current = Date.now();

          const tick = () => {
            const a = vadAnalyserRef.current;
            const buf = vadDataRef.current;
            if (!a || !buf) return;

            a.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i += 1) {
              const v = buf[i];
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            const now = Date.now();

            // VAD state logic: don't set silence before first speech
            if (rms >= VAD_SPEECH_THRESHOLD) {
              vadSpeechDetectedRef.current = true;
              vadLastVoiceTsRef.current = now;
              setVadState("speech");
            } else if (vadSpeechDetectedRef.current) {
              setVadState("silence");
            } else {
              setVadState("idle");
            }

            // Ensure auto-stop triggers once and doesn't stall
            if (vadSpeechDetectedRef.current) {
              const last = vadLastVoiceTsRef.current;
              if (last && now - last >= VAD_SILENCE_MS) {
                stopRecording();
                return;
              }
            }

            const started = vadStartTsRef.current;
            if (started && now - started >= VAD_MAX_MS) {
              stopRecording();
              return;
            }

            vadRafRef.current = requestAnimationFrame(tick);
          };

          vadRafRef.current = requestAnimationFrame(tick);
        } catch {
          // If VAD setup fails, fall back to manual stop
        }
      }

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const mimeType = mimeCandidates.find((m) =>
        MediaRecorder.isTypeSupported(m),
      );

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const shouldSkipSend = skipSendRef.current;
        // reset immediately so it doesn't leak to the next cycle
        skipSendRef.current = false;
        const didSend = !shouldSkipSend;
        try {
          const blob = new Blob(recordedChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          recordedChunksRef.current = [];

          if (!shouldSkipSend) {
            const base64 = await blobToBase64(blob);

            const outgoingVoice = {
              isLive: true,
              ...(isPushToTalkRef.current ? { isPushToTalk: true } : {}),
              LicenseId: licenseId,
              chat_type: "voice",
              requestType: "audio",
              avatar_id: avatarId,
              user_id: userId.current,
              language,
              source: "ravatar-api-demo",
              file_base64_data: base64,
              ...(sessionId && { session: sessionId }),
            } as unknown as OutgoingTextMessage;

            wsClientRef.current?.send(outgoingVoice);
            addSystemMessage("✅ Voice sent");
          }
        } catch (err) {
          addSystemMessage(
            `❌ Failed to send voice: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        } finally {
          stopVad();
          isPushToTalkRef.current = false;
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          setIsRecording(false);
          // Auto-restart VAD listening after sending (loop)
          if (
            didSend &&
            recordingModeRef.current === "vad" &&
            voiceModeRef.current === "vad" &&
            isLiveModeRef.current &&
            wsStatusRef.current === "connected" &&
            Boolean(licenseIdRef.current)
          ) {
            cancelVadRestart();
            // Defer to next tick so cleanup is finished
            vadRestartTimeoutRef.current = window.setTimeout(() => {
              // Re-check latest state at the moment of restart
              if (
                voiceModeRef.current !== "vad" ||
                !isLiveModeRef.current ||
                wsStatusRef.current !== "connected" ||
                !licenseIdRef.current
              ) {
                return;
              }
              void startRecording({ useVad: true, isPushToTalk: false });
            }, 0);
          }
        }
      };

      recorder.start();
      // Reset VAD state when recording actually starts
      setVadState("idle");
      setIsRecording(true);
      addSystemMessage(
        useVad
          ? "🎙️ Listening… speak and pause to auto-send (VAD)."
          : isPushToTalkRef.current
            ? "🎙️ Recording… release to send (push-to-talk)."
            : "🎙️ Recording... Click Stop Recording to send.",
      );
    } catch (err) {
      addSystemMessage(
        `❌ Microphone error: ${err instanceof Error ? err.message : "permission denied"}`,
      );
    }
  };

  const stopRecording = (opts?: { send?: boolean }) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    const send = opts?.send ?? true;
    skipSendRef.current = !send;

    // stop analyser loop (does NOT stop the MediaRecorder itself)
    stopVad();

    recorder.stop();
  };

  const startPushToTalk = () => {
    if (wsStatus !== "connected") return;
    if (!isLiveMode || !licenseId) return;
    if (isRecording) return;

    if (pttTimerRef.current != null) {
      window.clearTimeout(pttTimerRef.current);
      pttTimerRef.current = null;
    }

    pttDidStartRef.current = false;
    cancelVadRestart();

    pttTimerRef.current = window.setTimeout(() => {
      pttTimerRef.current = null;
      pttDidStartRef.current = true;
      void startRecording({ isPushToTalk: true, useVad: false });
    }, MIN_PTT_HOLD_MS);
  };

  const endPushToTalk = () => {
    // short tap: we never started recording => do nothing
    if (pttTimerRef.current != null) {
      window.clearTimeout(pttTimerRef.current);
      pttTimerRef.current = null;
      pttDidStartRef.current = false;
      return;
    }

    // hold: recording started => stop and send
    if (pttDidStartRef.current && isRecording) {
      stopRecording({ send: true });
    }

    pttDidStartRef.current = false;
  };

  const handleConnect = () => {
    if (wsStatus === "connected") {
      wsClientRef.current?.disconnect();
      wsClientRef.current = null;
      setWsStatus("disconnected");
      addSystemMessage("Disconnected from Ravatar");

      if (licenseId) void handleStopLive();
      return;
    }

    if (!canConnect) {
      addSystemMessage(
        "Please complete settings first (JWT, Avatar, Language)",
      );
      return;
    }

    const wsUrlWithToken = buildWsUrl();
    console.log("[WS] URL:", wsUrlWithToken);

    setWsStatus("connecting");
    addSystemMessage("Connecting to Ravatar...");

    const client = new RavatarWsClient({ url: wsUrlWithToken });
    wsClientRef.current = client;

    client.onMessage((message) => {
      console.log("[WS] Incoming:", message);
      if (message.type === "connection") {
        setWsStatus("connected");
        addSystemMessage("Connected to Ravatar WebSocket");
      } else if (message.type === "message") {
        handleIncomingMessage(message.data as IncomingMessage);
      }
    });

    client.onError(() => {
      setWsStatus("error");
      addSystemMessage("WebSocket error occurred");
    });

    client.onClose(() => {
      setWsStatus("disconnected");
      addSystemMessage("Connection closed");
      if (licenseId) void handleStopLive();
    });

    client.connect();
  };

  const handleIncomingMessage = (data: IncomingMessage) => {
    const anyData = data as unknown as Record<string, unknown>;

    const direction =
      typeof anyData.direction === "string" ? anyData.direction : undefined;
    const type = typeof anyData.type === "string" ? anyData.type : undefined;

    const systemText =
      typeof anyData.content === "string"
        ? anyData.content
        : typeof anyData.message === "string"
          ? anyData.message
          : undefined;

    if (type === "system" || direction === "system") {
      if (systemText) addSystemMessage(systemText);
      return;
    }

    const answerText =
      typeof anyData.answer === "string"
        ? anyData.answer
        : typeof anyData.content === "string"
          ? anyData.content
          : undefined;

    const fileUrl =
      typeof anyData.fileUrl === "string" ? anyData.fileUrl : undefined;

    // Some payloads can return base64 audio directly
    const audioBase64 =
      typeof anyData.file_base64_data === "string"
        ? (anyData.file_base64_data as string)
        : typeof anyData.audio_base64 === "string"
          ? (anyData.audio_base64 as string)
          : undefined;

    const audioSrc = audioBase64
      ? audioBase64.startsWith("data:")
        ? audioBase64
        : `data:audio/webm;base64,${audioBase64}`
      : fileUrl;

    const timestamp =
      typeof anyData.timestamp === "string"
        ? anyData.timestamp
        : typeof anyData.date === "number"
          ? new Date(anyData.date * 1000).toISOString()
          : new Date().toISOString();

    if (type === "incoming" || direction === "incoming") {
      if (!answerText) return;
      const assistantMessage: ChatMessage = {
        id: generateUUID(),
        role: "assistant",
        content: answerText,
        timestamp,
        // keep original fileUrl (if any) so MessageList can render a link
        fileUrl,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // If server provided an audio reply, try to autoplay it
      if (audioSrc) {
        void playAudio(audioSrc);
      }

      return;
    }

    if (type === "event" || direction === "event") {
      if (answerText) addSystemMessage(answerText);
      if (audioSrc) {
        void playAudio(audioSrc);
      }
      return;
    }

    if (answerText) addSystemMessage(answerText);
    if (audioSrc) {
      void playAudio(audioSrc);
    }
  };

  const addSystemMessage = (content: string) => {
    const systemMessage: ChatMessage = {
      id: generateUUID(),
      role: "system",
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMessage]);
  };

  const handleSend = () => {
    if (!canSend) return;

    if (isLiveMode && !licenseId) {
      addSystemMessage("Live mode requires LicenseId. Click Start Live first.");
      return;
    }

    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: "user",
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    const outgoingMessage = {
      isLive: isLiveMode,
      ...(isLiveMode ? { LicenseId: licenseId } : {}),
      chat_type: "text",
      requestType: "text",
      avatar_id: avatarId,
      user_id: userId.current,
      language,
      request: inputValue,
      source: "ravatar-api-demo",
      ...(sessionId && { session: sessionId }),
    } as unknown as OutgoingTextMessage;

    wsClientRef.current?.send(outgoingMessage);
    setInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Chat</h2>

      <ChatHeaderBar
        wsStatus={wsStatus}
        isLiveMode={isLiveMode}
        licenseId={licenseId}
        liveStatus={liveStatus}
        canConnect={canConnect}
        jwtToken={jwtToken}
        avatarId={avatarId}
        onConnect={handleConnect}
        onStartLive={handleStartLive}
        onStopLive={handleStopLive}
      />

      {!canConnect && (
        <div className={styles.warning}>
          ⚠️ Please complete settings first: Get JWT → Load Connection → Select
          Avatar & Language
        </div>
      )}
      <div className={isLiveMode ? styles.liveLayout : styles.chatLayout}>
        {isLiveMode && (
          <PixelStreamingPanel
            jwtToken={jwtToken}
            isLiveMode={isLiveMode}
            licenseId={licenseId}
            streamingUrl={streamingUrl}
            pixelStatus={pixelStatus}
            onLoaded={() => setPixelStatus("loaded")}
          />
        )}

        <MessageList messages={messages} />
      </div>

      <ChatInputBar
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        disabled={wsStatus !== "connected"}
        canSend={canSend}
      />

      <VoiceControls
        isLiveMode={isLiveMode}
        licenseId={licenseId}
        isRecording={isRecording}
        wsStatus={wsStatus}
        voiceMode={voiceMode}
        vadState={vadState}
        onChangeVoiceMode={(m) => setVoiceMode(m)}
        // Record → Stop → Send
        onStartRecording={() =>
          void startRecording({ isPushToTalk: false, useVad: false })
        }
        onStopRecording={() => stopRecording({ send: true })}
        // Push-to-talk: only starts after hold, sends on release
        onPTTStart={startPushToTalk}
        onPTTEnd={endPushToTalk}
      />
    </div>
  );
}
