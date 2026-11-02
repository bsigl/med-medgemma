"use client";

import { ChatMessage } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import Markdown from "./Markdown";

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Generating response">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </span>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const copy = () => {
    if (!message.content || message.pending) return;
    void navigator.clipboard?.writeText(message.content).catch(() => {
      /* clipboard unavailable */
    });
  };

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar" aria-hidden="true">
        {isUser ? "YOU" : "MG"}
      </div>
      <div className="msg-body">
        <div className={`msg-bubble${message.error ? " msg-error" : ""}`}>
          {message.pending ? (
            <TypingDots />
          ) : isUser ? (
            <p className="msg-plain">{message.content}</p>
          ) : (
            <Markdown content={message.content || "*(empty response)*"} />
          )}
        </div>
        <div className="msg-meta">
          <span>{formatTime(message.createdAt)}</span>
          {!isUser && !message.pending && message.content && (
            <button type="button" className="msg-copy" onClick={copy} title="Copy response">
              Copy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
