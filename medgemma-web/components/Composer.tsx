"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";

const MAX_PROMPT_LENGTH = 12_000;

interface ComposerProps {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function Composer({ busy, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea with content (up to 200px).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || tooLong) return;
    onSend(text);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const tooLong = value.length > MAX_PROMPT_LENGTH;

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            busy ? "MedGemma is generating…" : "Ask MedGemma a medical question…"
          }
          rows={1}
          maxLength={MAX_PROMPT_LENGTH + 200}
        />
        <div className="composer-actions">
          {busy ? (
            <button type="button" className="btn-stop" onClick={onStop} title="Stop generating">
              ■ Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn-send"
              onClick={submit}
              disabled={!value.trim() || tooLong}
              title="Send (Enter)"
            >
              ➤ Send
            </button>
          )}
        </div>
      </div>
      <div className="composer-hint">
        {tooLong ? (
          <span className="hint-warning">Prompt is too long (max 12,000 characters).</span>
        ) : (
          <span>Enter to send · Shift+Enter for a new line · Each prompt is independent — include context every time.</span>
        )}
      </div>
    </div>
  );
}
