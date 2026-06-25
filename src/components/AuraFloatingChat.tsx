import { useEffect, useRef, useState } from "react";
import type { AssistantAction } from "../types";
import { useAuraChat, type AuraUserStats } from "../hooks/useAuraChat";
import type { AssistantMarketContext } from "./AuraAssistant";

const SUGGESTIONS = [
  "Which markets are about Bitcoin?",
  "Show me the hottest live markets",
  "Do I have any winnings to claim?"
];

export function AuraFloatingChat({
  account,
  markets,
  userStats,
  onAction,
  onConnect,
  busy
}: {
  account: string;
  markets: AssistantMarketContext[];
  userStats: AuraUserStats | null;
  onAction: (action: AssistantAction) => void;
  onConnect: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { messages, input, setInput, loading, send, clearChat } = useAuraChat({ account, markets, userStats, onAction });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const marketById = new Map(markets.map((m) => [m.id, m]));

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Floating trigger button */}
      <button
        className="aura-float-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask Aura AI"
        type="button"
      >
        <span className="aura-float-icon" aria-hidden>✦</span>
        <span className="aura-float-label">Ask AI</span>
        {messages.length > 0 && !open && (
          <span className="aura-float-badge">{messages.filter((m) => m.role === "assistant").length}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="aura-float-panel" role="dialog" aria-label="Aura AI chat">
          <div className="aura-float-header">
            <span className="aura-float-header-icon" aria-hidden>✦</span>
            <div className="aura-float-header-info">
              <strong>Aura AI</strong>
              <span>live from the chain · /</span>
            </div>
            <div className="aura-float-header-actions">
              {messages.length > 0 && (
                <button onClick={clearChat} type="button" title="New chat">New</button>
              )}
              <button onClick={() => setOpen(false)} type="button" aria-label="Close">✕</button>
            </div>
          </div>

          <div className="aura-float-thread" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="assistant-empty aura-float-empty">
                <p>{account ? "Ask me anything about AuraOn:" : "Connect your wallet to chat with Aura AI."}</p>
                {account ? (
                  <div className="assistant-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => void send(s)}>{s}</button>
                    ))}
                  </div>
                ) : (
                  <div className="assistant-suggestions">
                    <button type="button" onClick={onConnect}>Connect wallet</button>
                  </div>
                )}
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className={`assistant-bubble ${message.role}`}>
                <span className="assistant-bubble-role">{message.role === "user" ? "You" : "✦ Aura AI"}</span>
                <div className="assistant-bubble-text">{message.content}</div>
                {message.actions && message.actions.length > 0 && (
                  <div className="assistant-actions">
                    {message.actions.map((action, i) => {
                      const market = marketById.get(action.marketId);
                      return (
                        <button
                          key={i}
                          type="button"
                          className={`assistant-action-card ${action.type}`}
                          disabled={busy || (action.type !== "view" && !account)}
                          onClick={() => onAction(action)}
                        >
                          <span className="assistant-action-label">{action.label}</span>
                          {market && <span className="assistant-action-question">{market.question}</span>}
                          <span className="assistant-action-meta">
                            Market #{action.marketId}
                            {action.side ? ` · ${action.side}` : ""}
                            {action.amount ? ` · ${action.amount} USDC` : ""}
                            {market ? ` · YES ${market.yesPercent}% / NO ${market.noPercent}%` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="assistant-bubble assistant">
                <div className="assistant-typing"><span /><span /><span /></div>
              </div>
            )}
          </div>

          <form
            className="aura-float-input-row"
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              placeholder="Ask about Arc, USDC, any project…"
              onChange={(e) => setInput(e.target.value)}
              disabled={!account}
            />
            <button type="submit" disabled={loading || !input.trim() || !account}>
              Send
            </button>
          </form>
          <p className="aura-float-hint">Enter to send · Shift+Enter for newline · Esc to close</p>
        </div>
      )}
    </>
  );
}
