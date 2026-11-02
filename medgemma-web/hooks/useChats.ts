"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat, ChatMessage, Settings } from "@/lib/types";
import {
  DEFAULT_SETTINGS,
  loadActiveChatId,
  loadChats,
  loadSettings,
  saveActiveChatId,
  saveChats,
  saveSettings,
} from "@/lib/storage";
import { deriveTitle, newId } from "@/lib/utils";

/**
 * Multi-chat state with localStorage persistence.
 * Chats exist only in this browser — the server keeps nothing.
 */
export function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const hydrated = useRef(false);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    const loaded = loadChats();
    setChats(loaded);
    setSettings(loadSettings());
    const stored = loadActiveChatId();
    setActiveId(
      stored && loaded.some((c) => c.id === stored) ? stored : (loaded[0]?.id ?? null),
    );
    hydrated.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (hydrated.current) saveChats(chats);
  }, [chats]);

  useEffect(() => {
    if (hydrated.current) saveActiveChatId(activeId);
  }, [activeId]);

  useEffect(() => {
    if (hydrated.current) saveSettings(settings);
  }, [settings]);

  const createChat = useCallback((): Chat => {
    const now = Date.now();
    const chat: Chat = {
      id: newId(),
      title: "New chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    return chat;
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveId((current) => (current === id ? (next[0]?.id ?? null) : current));
      return next;
    });
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: clean.slice(0, 80) } : c)),
    );
  }, []);

  const clearChat = useCallback((id: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, messages: [], title: "New chat", updatedAt: Date.now() } : c,
      ),
    );
  }, []);

  const addMessage = useCallback((chatId: string, message: ChatMessage) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const isFirstUser = message.role === "user" && !c.messages.some((m) => m.role === "user");
        return {
          ...c,
          title: isFirstUser && c.title === "New chat" ? deriveTitle(message.content) : c.title,
          messages: [...c.messages, message],
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const updateMessage = useCallback(
    (chatId: string, messageId: string, patch: Partial<ChatMessage>) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
                updatedAt: Date.now(),
              }
            : c,
        ),
      );
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return {
    chats,
    activeId,
    setActiveId,
    settings,
    updateSettings,
    ready,
    createChat,
    deleteChat,
    renameChat,
    clearChat,
    addMessage,
    updateMessage,
  };
}
