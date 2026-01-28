import type { KeyboardEvent } from "react";
import styles from "./ChatPanel.module.css";

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;

  disabled: boolean;
  canSend: boolean;
}

export function ChatInputBar({
  value,
  onChange,
  onSend,
  onKeyDown,
  disabled,
  canSend,
}: ChatInputBarProps) {
  return (
    <div className={styles.inputContainer}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className={styles.input}
      />
      <button
        onClick={onSend}
        disabled={!canSend}
        className={`${styles.sendButton} ${canSend ? "" : styles.disabledButton}`}
      >
        Send
      </button>
    </div>
  );
}
