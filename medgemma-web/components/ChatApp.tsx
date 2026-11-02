"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChats } from "@/hooks/useChats";
import { useKeepAlive } from "@/hooks/useKeepAlive";
import { useTheme } from "@/hooks/useTheme";
import { ChatMessage } from "@/lib/types";
import { MAX_CHATS } from "@/lib/storage";
import { newId } from "@/lib/utils";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import Composer from "./Composer";
import StatusPill from "./StatusPill";
import SettingsDialog from "./SettingsDialog";

export default function ChatApp() {
  const {
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
  } = useChats();

  // Keepalive pooling: pings /api/health every settings.keepAliveSeconds (default 30s).
  const { status, info, lastCheckedAt, check } = useKeepAlive(settings.keepAliveSeconds);
  const { theme, toggle: toggleTheme } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const activeChat = chats.find((c) => c.id === activeId) ?? null;
  const busy = activeChat ? activeChat.messages.some((m) => m.pending) : false;

  // If the active chat was deleted, clear the pending title edit.
  useEffect(() => {
    if (titleDraft !== null && !activeChat) setTitleDraft(null);
  }, [activeChat, titleDraft]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleNewChat = useCallback(() => {
    setTitleDraft(null);
    createChat();
    setSidebarOpen(false);
  }, [createChat]);

  /** Send one independent, stateless prompt to the model. */
  const send = useCallback(
    async (text: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      stop();

      // No chat yet → create one and use its id directly.
      let chatId = activeId;
      if (!chatId || !chats.some((c) => c.id === chatId)) {
        chatId = createChat().id;
      }

      addMessage(chatId, {
        id: newId(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      } satisfies ChatMessage);

      const assistantId = newId();
      addMessage(chatId, {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        pending: true,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, maxNewTokens: settings.maxNewTokens }),
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; response?: string; error?: string; status?: number }
          | null;

        if (!res.ok || !payload?.ok) {
          updateMessage(chatId, assistantId, {
            pending: false,
            error: true,
            content:
              payload?.error ??
              `Request failed with HTTP ${res.status}. Please check the API status and try again.`,
          });
        } else {
          updateMessage(chatId, assistantId, {
            pending: false,
            content: payload.response ?? "",
          });
        }
      } catch (error) {
        const aborted = (error as Error)?.name === "AbortError";
        if (!aborted) {
          updateMessage(chatId, assistantId, {
            pending: false,
            error: true,
            content:
              "Network error: could not reach the server. Check your connection and try again.",
          });
        } else {
          updateMessage(chatId, assistantId, {
            pending: false,
            content: "*Generation stopped by user.*",
          });
        }
      } finally {
        sendingRef.current = false;
        abortRef.current = null;
      }
    },
    [activeId, chats, addMessage, createChat, settings.maxNewTokens, stop, updateMessage],
  );

  const pickPrompt = useCallback(
    (prompt: string) => {
      void send(prompt);
    },
    [send],
  );

  const sidebarFooter = (
    <>
      <div className="footer-row">
        <StatusPill status={status} lastCheckedAt={lastCheckedAt} onCheck={() => void check()} />
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙
        </button>
      </div>
      <span className="muted">
        {chats.length} / {MAX_CHATS} chats · stored in this browser
      </span>
    </>
  );

  return (
    <div className="app">
      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        ready={ready}
        footer={sidebarFooter}
        onNewChat={handleNewChat}
        onSelect={(id) => {
          setActiveId(id);
          setTitleDraft(null);
          setSidebarOpen(false);
        }}
        onDelete={(id) => {
          deleteChat(id);
          if (id === activeId) setTitleDraft(null);
        }}
        onRename={renameChat}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon hamburger"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Chats"
            aria-label="Toggle chat list"
          >
            ☰
          </button>

          <div className="topbar-title-wrap">
            {titleDraft !== null && activeChat ? (
              <input
                className="title-input"
                value={titleDraft}
                autoFocus
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && activeChat) {
                    renameChat(activeChat.id, titleDraft);
                    setTitleDraft(null);
                  } else if (event.key === "Escape") {
                    setTitleDraft(null);
                  }
                }}
                onBlur={() => {
                  if (activeChat && titleDraft.trim()) renameChat(activeChat.id, titleDraft);
                  setTitleDraft(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="topbar-title"
                onClick={() => setTitleDraft(activeChat?.title ?? "")}
                title="Click to rename this chat"
              >
                {activeChat?.title ?? "MedGemma Chat"}
              </button>
            )}
          </div>

          <div className="topbar-right">
            {activeChat && activeChat.messages.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => clearChat(activeChat.id)}
                title="Clear this conversation"
                aria-label="Clear conversation"
              >
                ⟲
              </button>
            )}
            <StatusPill
              status={status}
              lastCheckedAt={lastCheckedAt}
              onCheck={() => void check()}
            />
          </div>
        </header>

        <ChatView chat={activeChat} busy={busy} onPickPrompt={pickPrompt} />

        <Composer busy={busy} onSend={(text) => void send(text)} onStop={stop} />
      </main>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        healthInfo={info}
        onClose={() => setSettingsOpen(false)}
        onChange={updateSettings}
        onCheckNow={() => void check()}
      />
    </div>
  );
}
