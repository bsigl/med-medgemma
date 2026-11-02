import { Chat, Settings } from "./types";
import { clampInt } from "./utils";

/**
 * All chat data lives in the browser's localStorage.
 * Nothing is stored server-side; the remote MedGemma API keeps no history.
 */

const CHATS_KEY = "medgemma.chats.v1";
const SETTINGS_KEY = "medgemma.settings.v2"; // v2: default maxNewTokens raised to 1024
const ACTIVE_KEY = "medgemma.activeChat.v1";
const THEME_KEY = "medgemma.theme.v1";

export { THEME_KEY };

export const DEFAULT_SETTINGS: Settings = {
  maxNewTokens: 1024,
  keepAliveSeconds: 30,
};

/** Hard cap so localStorage never overflows. */
export const MAX_CHATS = 50;

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  const chats = parse<Chat[]>(window.localStorage.getItem(CHATS_KEY), []);
  if (!Array.isArray(chats)) return [];
  return chats.filter(
    (chat) =>
      chat &&
      typeof chat.id === "string" &&
      typeof chat.title === "string" &&
      Array.isArray(chat.messages) &&
      chat.messages.every(
        (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      ),
  );
}

export function saveChats(chats: Chat[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    // Storage full: retry with the newest half, then give up silently.
    try {
      const half = chats.slice(0, Math.max(1, Math.floor(MAX_CHATS / 2)));
      window.localStorage.setItem(CHATS_KEY, JSON.stringify(half));
    } catch {
      /* ignore */
    }
  }
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const stored = parse<Partial<Settings>>(window.localStorage.getItem(SETTINGS_KEY), {});
  return {
    maxNewTokens: clampInt(stored.maxNewTokens, 1, 1024, DEFAULT_SETTINGS.maxNewTokens),
    keepAliveSeconds: clampInt(stored.keepAliveSeconds, 10, 300, DEFAULT_SETTINGS.keepAliveSeconds),
  };
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadActiveChatId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(ACTIVE_KEY);
  return id && id.length > 0 ? id : null;
}

export function saveActiveChatId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* ignore */
    }
  } else {
    window.localStorage.removeItem(ACTIVE_KEY);
  }
}
