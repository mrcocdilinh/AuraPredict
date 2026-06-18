import { useEffect, useRef } from "react";
import type { AssistantAction } from "../types";
import { useAuraChat } from "../hooks/useAuraChat";

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
  myYes?: number;       // USDC staked YES by current user
  myNo?: number;        // USDC staked NO by current user
  myPayout?: number;    // claimable payout in USDC
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
  onConnect,
  busy
}: {
  account: string;
  markets: AssistantMarketContext[];
  onAction: (action: AssistantAction) => void;
  onConnect: () => void;
  busy?: boolean;
}) {
  const { messages, input, setInput, loading, send, clearChat } = useAuraChat({ account, markets, onAction });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const marketById = new Map(markets.map((m) => [m.id, m]));

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  return (
    <section className="assistant-page">
      <div className="assistant-header">
        <div className="assistant-avatar" aria-hidden>✦</div>
        <div>
          <h2>Aura AI</h2>
          <p>Find markets, place bets, check results, and claim — all by chat. You always sign in your wallet.</p>
        </div>
        {messages.length > 0 && (
          <button className="assistant-new-btn" onClick={clearChat} type="button">New</button>
        )}
      </div>

      {!account ? (
        <div className="assistant-thread">
          <div className="assistant-empty">
            <p>Connect your wallet to chat with Aura AI.</p>
            <div className="assistant-suggestions">
              <button type="button" onClick={onConnect}>Connect wallet</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="assistant-thread" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="assistant-empty">
                <p>Ask me anything about AuraPredict. Try one of these:</p>
                <div className="assistant-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)}>{s}</button>
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
                <div className="assistant-typing"><span /><span /><span /></div>
              </div>
            )}
          </div>
          <form
            className="assistant-input-row"
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <input
              type="text"
              value={input}
              placeholder="Message Aura AI…"
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={loading || !input.trim()}>Send</button>
          </form>
        </>
      )}
    </section>
  );
}
