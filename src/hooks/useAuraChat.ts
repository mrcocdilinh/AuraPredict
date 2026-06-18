import { useCallback, useState } from "react";
import type { AssistantAction, AssistantMessage } from "../types";
import { INDEXER_URL } from "../constants";

const STORAGE_KEY = "aura_chat_history";

function loadHistory(): AssistantMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AssistantMessage[];
  } catch {
    return [];
  }
}

function saveHistory(messages: AssistantMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // storage full — ignore
  }
}

export function useAuraChat({
  account,
  markets,
  onAction
}: {
  account: string;
  markets: { id: number; question: string; category: string; status: string; yesPercent: number; noPercent: number; closeIso: string; outcome: string; claimable: boolean }[];
  onAction: (action: AssistantAction) => void;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !account) return;
      const nextHistory: AssistantMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextHistory);
      saveHistory(nextHistory);
      setInput("");
      setLoading(true);
      try {
        const response = await fetch(`${INDEXER_URL}/api/assistant/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
            markets
          })
        });
        const data = (await response.json().catch(() => ({}))) as {
          reply?: string;
          actions?: AssistantAction[];
        };
        const reply: AssistantMessage = {
          role: "assistant",
          content: data.reply || "Aura AI is unavailable right now. Please try again.",
          actions: Array.isArray(data.actions) ? data.actions : []
        };
        const updated = [...nextHistory, reply];
        setMessages(updated);
        saveHistory(updated);
      } catch {
        const errMsg: AssistantMessage = {
          role: "assistant",
          content: "Could not reach Aura AI. Check your connection and try again."
        };
        const updated = [...nextHistory, errMsg];
        setMessages(updated);
        saveHistory(updated);
      } finally {
        setLoading(false);
      }
    },
    [account, loading, markets, messages]
  );

  return { messages, input, setInput, loading, send, clearChat, onAction };
}
