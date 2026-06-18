import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantAction, AssistantMessage } from "../types";
import { INDEXER_URL } from "../constants";

export type AssistantMarketContext = {
  id: number;
  question: string;
  category: string;
  status: string;
  yesPercent: number;
  noPercent: number;
  closeIso: string;
  outcome: string;
  claimable: boolean;
};

const SUGGESTIONS = [
  "Which markets are about Bitcoin?",
  "Bet $20 YES on the highest-volume live market",
  "Do I have any winnings to claim?"
];

export function AuraAssistant({
  account,
  markets,
  onAction,
  busy
}: {
  account: string;
  markets: AssistantMarketContext[];
  onAction: (action: AssistantAction) => void;
  busy?: boolean;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const marketById = new Map(markets.map((market) => [market.id, market]));

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const nextHistory: AssistantMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextHistory);
      setInput("");
      setLoading(true);
      try {
        const response = await fetch(`${INDEXER_URL}/api/assistant/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: nextHistory.map((message) => ({ role: message.role, content: message.content })),
            markets
          })
        });
        const data = (await response.json().catch(() => ({}))) as {
          reply?: string;
          actions?: AssistantAction[];
        };
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: data.reply || "Aura AI is unavailable right now. Please try again.",
            actions: Array.isArray(data.actions) ? data.actions : []
          }
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          { role: "assistant", content: "Could not reach Aura AI. Check your connection and try again." }
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, markets, messages]
  );

  return (
    <section className="assistant-page">
      <div className="assistant-header">
        <div className="assistant-avatar" aria-hidden>
          ✦
        </div>
        <div>
          <h2>Aura AI</h2>
          <p>Find markets, place bets, check results, and claim — all by chat. You always sign in your wallet.</p>
        </div>
      </div>

      <div className="assistant-thread" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="assistant-empty">
            <p>Ask me anything about AuraPredict. Try one of these:</p>
            <div className="assistant-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`assistant-bubble ${message.role}`}>
            <span className="assistant-bubble-role">{message.role === "user" ? "You" : "✦ Aura AI"}</span>
            <div className="assistant-bubble-text">{message.content}</div>
            {message.actions && message.actions.length > 0 && (
              <div className="assistant-actions">
                {message.actions.map((action, actionIndex) => {
                  const market = marketById.get(action.marketId);
                  return (
                    <button
                      key={actionIndex}
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
                        {market && market.status !== "live" ? ` · ${market.status}` : ""}
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
            <div className="assistant-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <form
        className="assistant-input-row"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          value={input}
          placeholder="Message Aura AI…"
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
