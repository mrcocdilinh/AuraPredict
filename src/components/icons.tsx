import { CATEGORY_META } from "../constants";
import type { ThemeMode } from "../types";

const KNOWN_CATEGORIES = new Set(Object.keys(CATEGORY_META));

export function CategoryIcon({ category }: { category: string }) {
  const key = KNOWN_CATEGORIES.has(category) ? category : "Other";

  if (key === "Crypto") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 20 12 12 21 4 12 12 3Z" />
        <path d="M12 3v18" />
        <path d="M4 12h16" />
      </svg>
    );
  }

  if (key === "Macro") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3 19h18" />
      </svg>
    );
  }

  if (key === "Sports") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M6.5 8.5c3.6 1.4 7.4 1.4 11 0" />
        <path d="M6.5 15.5c3.6-1.4 7.4-1.4 11 0" />
      </svg>
    );
  }

  if (key === "Politics") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16" />
        <path d="M6 17V9" />
        <path d="M18 17V9" />
        <path d="M12 17V9" />
        <path d="M3 9h18L12 4 3 9Z" />
      </svg>
    );
  }

  if (key === "Arc") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17c3.1-6.8 12.9-6.8 16 0" />
        <path d="M8 18 12 9l4 9" />
      </svg>
    );
  }

  if (key === "AI") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v5" />
        <path d="M12 16v5" />
        <path d="M3 12h5" />
        <path d="M16 12h5" />
        <path d="M9 9h6v6H9z" />
      </svg>
    );
  }

  if (key === "Other") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="18" cy="12" r="2" />
      </svg>
    );
  }

  return (
    <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h6v6H4z" />
      <path d="M14 5h6v6h-6z" />
      <path d="M4 15h6v4H4z" />
      <path d="M14 15h6v4h-6z" />
    </svg>
  );
}

export function ThemeIcon({ theme }: { theme: ThemeMode }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="M4.93 4.93 6.34 6.34" />
        <path d="M17.66 17.66 19.07 19.07" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="M4.93 19.07 6.34 17.66" />
        <path d="M17.66 6.34 19.07 4.93" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.2A8 8 0 0 1 9.8 4 7 7 0 1 0 20 14.2Z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function GridViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h5v5H5z" />
      <path d="M14 5h5v5h-5z" />
      <path d="M5 14h5v5H5z" />
      <path d="M14 14h5v5h-5z" />
    </svg>
  );
}

export function ListViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}

export function MobileMarketTabIcon({ tabKey }: { tabKey: "overview" | "trade" | "resolve" | "details" }) {
  if (tabKey === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-4 4" />
      </svg>
    );
  }
  if (tabKey === "trade") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    );
  }
  if (tabKey === "resolve") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <circle cx="12" cy="16" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function MobileNavIcon({ icon }: { icon: "markets" | "hot" | "leaderboard" | "alerts" | "profile" | "owner" | "assistant" }) {
  if (icon === "leaderboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16" />
        <rect x="5" y="11" width="4" height="7" />
        <rect x="10" y="6" width="4" height="12" />
        <rect x="15" y="13" width="4" height="5" />
      </svg>
    );
  }

  if (icon === "assistant") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3L12 3Z" />
        <path d="M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7L18 14Z" />
      </svg>
    );
  }

  if (icon === "markets") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M9.5 20v-5h5v5" />
      </svg>
    );
  }

  if (icon === "hot") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18h16" />
        <path d="m5 15 4-4 3 3 6-7" />
        <path d="M15 7h3v3" />
      </svg>
    );
  }

  if (icon === "alerts") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" />
        <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
      </svg>
    );
  }

  if (icon === "profile") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}
