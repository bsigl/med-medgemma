"use client";

import { useEffect, useRef } from "react";
import { Chat } from "@/lib/types";
import MessageBubble from "./MessageBubble";

const EXAMPLE_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "Iron vs. B12 deficiency",
    prompt: "Explain the difference between iron deficiency and vitamin B12 deficiency.",
  },
  {
    label: "Pneumonia treatment",
    prompt: "What are the first-line treatments for community-acquired pneumonia in adults?",
  },
  {
    label: "Diabetes criteria",
    prompt: "Summarize the current diagnostic criteria for type 2 diabetes.",
  },
  {
    label: "Warfarin interactions",
    prompt: "List the most clinically important drug interactions with warfarin.",
  },
];

interface ChatViewProps {
  chat: Chat | null;
  busy: boolean;
  onPickPrompt: (prompt: string) => void;
}

export default function ChatView({ chat, busy, onPickPrompt }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const messageCount = chat?.messages.length ?? 0;

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, chat?.id]);

  return (
    <div className="messages">
      {!chat || messageCount === 0 ? (
        <div className="empty-state">
          <div className="empty-card">
            <h1 className="empty-title">MedGemma Chat</h1>
            <p className="empty-sub">
              Ask a clinical question and MedGemma 4B will answer. You are talking to a remote
              model — each question is independent and the API keeps no conversation history,
              so include context in every prompt.
            </p>
            <div className="prompt-grid">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="prompt-btn"
                  onClick={() => onPickPrompt(example.prompt)}
                  disabled={busy}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {chat.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={endRef} />
        </>
      )}
    </div>
  );
}
