import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/ravatar";
import styles from "./MessageList.module.css";

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)($|\?)/i.test(url);
const isAudioUrl = (url: string) =>
  /\.(mp3|wav|m4a|aac|ogg|opus|webm)($|\?)/i.test(url);

const splitEchoedPrompt = (
  content: string,
): { prompt: string | null; answer: string } => {
  // Ravatar sometimes returns: ">User question\n\nAssistant answer"
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(">")) return { prompt: null, answer: content };

  const lines = trimmed.split(/\r?\n/);
  const promptLines: string[] = [];
  let i = 0;

  // Collect consecutive blockquote lines
  while (i < lines.length && lines[i].trimStart().startsWith(">")) {
    promptLines.push(lines[i].replace(/^\s*>\s?/, ""));
    i += 1;
  }

  // Skip blank lines between prompt and answer
  while (i < lines.length && lines[i].trim() === "") i += 1;

  const promptBlock = promptLines.join("\n").trim();
  const answerBlock = lines.slice(i).join("\n").trimStart();

  // If there is no separate answer block, try to split within the first line:
  // e.g. ">What date is it? Today's date is Thursday."
  if (!answerBlock && promptLines.length === 1) {
    const oneLine = promptLines[0].trim();
    const qIdx = oneLine.indexOf("?");
    if (qIdx >= 0) {
      const prompt = oneLine.slice(0, qIdx + 1).trim();
      const answer = oneLine.slice(qIdx + 1).trimStart();
      return { prompt: prompt || null, answer: answer || "" };
    }
  }

  return { prompt: promptBlock || null, answer: answerBlock || "" };
};

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
          const chatType = message.chat_type as string | undefined;
          const requestType = message.requestType as string | undefined;

          const isVoiceMessage =
            chatType === "voice" || requestType === "audio";

          const { prompt: echoedPrompt, answer: cleanedAnswer } =
            isVoiceMessage && message.role === "assistant"
              ? splitEchoedPrompt(message.content)
              : { prompt: null, answer: message.content };

          const renderMessageBubble = (
            id: string,
            role: "user" | "assistant" | "system",
            content: string,
            timestamp: string | number | Date,
            fileUrl?: string,
            isHistory?: boolean,
          ) => {
            const bubbleRoleClass =
              role === "user"
                ? styles.userMessage
                : role === "system"
                  ? styles.systemMessage
                  : styles.assistantMessage;

            const hasAudio = Boolean(fileUrl && isAudioUrl(fileUrl));
            const widthClass = hasAudio ? styles.hasAudio : "";
            return (
              <div
                key={id}
                className={`${styles.message} ${bubbleRoleClass} ${widthClass}`}
              >
                <div className={styles.role}>
                  {role === "user"
                    ? "👤 You"
                    : role === "system"
                      ? "🔧 System"
                      : "🤖 Assistant"}
                </div>

                <div className={styles.content}>{content}</div>

                {fileUrl && (
                  <div className={styles.fileUrl}>
                    {isVideoUrl(fileUrl) ? (
                      <video
                        src={fileUrl}
                        className={styles.media}
                        controls
                        playsInline
                      />
                    ) : isAudioUrl(fileUrl) ? (
                      <audio
                        src={fileUrl}
                        className={styles.media}
                        controls
                        autoPlay={!isHistory}
                      />
                    ) : (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                      >
                        📎 Open response
                      </a>
                    )}

                    {/* <div className={styles.fileMeta}>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                      >
                        Open in new tab
                      </a>
                    </div> */}
                  </div>
                )}

                <div className={styles.timestamp}>
                  {new Date(timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          };

          if (echoedPrompt) {
            return (
              <>
                {renderMessageBubble(
                  `${message.id}-prompt`,
                  "user",
                  echoedPrompt,
                  message.timestamp,
                )}
                {renderMessageBubble(
                  message.id,
                  "assistant",
                  cleanedAnswer,
                  message.timestamp,
                  message.fileUrl,
                  message.isHistory,
                )}
              </>
            );
          }

          return renderMessageBubble(
            message.id,
            message.role,
            cleanedAnswer,
            message.timestamp,
            message.fileUrl,
            message.isHistory,
          );
        })}
      <div ref={bottomRef} />
    </div>
  );
}
