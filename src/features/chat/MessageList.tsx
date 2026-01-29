import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/ravatar";
import styles from "./MessageList.module.css";

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)($|\?)/i.test(url);
const isAudioUrl = (url: string) =>
  /\.(mp3|wav|m4a|aac|ogg|opus|webm)($|\?)/i.test(url);

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Scroll to the latest message when a new one is appended
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className={styles.empty}>No messages yet. Start a conversation!</div>
    );
  }

  return (
    <div className={styles.container}>
      {messages
        .filter((m) => m.role !== "system")
        .map((message) => {
          const roleClass =
            message.role === "user"
              ? styles.userMessage
              : message.role === "system"
                ? styles.systemMessage
                : styles.assistantMessage;

          return (
            <div key={message.id} className={`${styles.message} ${roleClass}`}>
              <div className={styles.role}>
                {message.role === "user"
                  ? "👤 You"
                  : message.role === "system"
                    ? "🔧 System"
                    : "🤖 Assistant"}
              </div>

              <div className={styles.content}>{message.content}</div>

              {message.fileUrl && (
                <div className={styles.fileUrl}>
                  {isVideoUrl(message.fileUrl) ? (
                    <video
                      src={message.fileUrl}
                      className={styles.media}
                      controls
                      playsInline
                    />
                  ) : isAudioUrl(message.fileUrl) ? (
                    <audio
                      src={message.fileUrl}
                      className={styles.media}
                      controls
                      autoPlay={!message.isHistory}
                    />
                  ) : (
                    <a
                      href={message.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.link}
                    >
                      📎 Open response
                    </a>
                  )}

                  <div className={styles.fileMeta}>
                    <a
                      href={message.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.link}
                    >
                      Open in new tab
                    </a>
                  </div>
                </div>
              )}

              <div className={styles.timestamp}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      <div ref={bottomRef} />
    </div>
  );
}
