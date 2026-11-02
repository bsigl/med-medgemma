"use client";

import { KeyboardEvent, useState } from "react";
import { Chat } from "@/lib/types";
import { formatRelative } from "@/lib/utils";

interface SidebarProps {
  chats: Chat[];
  activeId: string | null;
  open: boolean;
  ready: boolean;
  footer: React.ReactNode;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose: () => void;
}

export default function Sidebar({
  chats,
  activeId,
  open,
  ready,
  footer,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
  onClose,
}: SidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (chat: Chat) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue);
    }
    setRenamingId(null);
  };

  const handleRenameKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      setRenamingId(null);
    }
  };

  return (
    <>
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-header">
          <span className="brand">
            <span className="brand-dot" aria-hidden="true" />
            MedGemma Chat
          </span>
          <button
            type="button"
            className="btn btn-primary btn-icon"
            onClick={onNewChat}
            title="New chat"
          >
            + New
          </button>
        </div>

        <div className="chat-list">
          {!ready ? (
            <div className="muted" style={{ padding: "10px" }}>
              Loading chats…
            </div>
          ) : chats.length === 0 ? (
            <div className="muted" style={{ padding: "10px" }}>
              No chats yet. Start a new one.
            </div>
          ) : (
            [...chats] // newest first
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-item${chat.id === activeId ? " active" : ""}`}
                  onClick={() => {
                    if (renamingId !== chat.id) onSelect(chat.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && renamingId !== chat.id) onSelect(chat.id);
                  }}
                >
                  {renamingId === chat.id ? (
                    <input
                      className="chat-rename-input"
                      value={renameValue}
                      autoFocus
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={handleRenameKeys}
                      onBlur={commitRename}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="chat-title">{chat.title}</div>
                      <div className="chat-time">{formatRelative(chat.updatedAt)}</div>
                      <div className="chat-actions">
                        <button
                          type="button"
                          className="chat-action-btn"
                          title="Rename"
                          onClick={(event) => {
                            event.stopPropagation();
                            startRename(chat);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="chat-action-btn"
                          title="Delete chat"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(chat.id);
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
          )}
        </div>

        <div className="sidebar-footer">{footer}</div>
      </aside>

      {open && <div className="backdrop" onClick={onClose} />}
    </>
  );
}
