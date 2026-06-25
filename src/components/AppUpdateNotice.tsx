import { useEffect, useState } from "react";

function currentBundleSrcFromDocument() {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return script?.src || "";
}

function bundleSrcFromHtml(html: string) {
  const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  if (!match?.[1]) return "";
  return new URL(match[1], window.location.origin).href;
}

export function AppUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentBundleSrc = currentBundleSrcFromDocument();
    if (!currentBundleSrc) return;

    let canceled = false;
    const checkForUpdate = async () => {
      try {
        const response = await fetch(`/?_=${Date.now()}`, { cache: "no-store" });
        const html = await response.text();
        const latestBundleSrc = bundleSrcFromHtml(html);
        if (!canceled && latestBundleSrc && latestBundleSrc !== currentBundleSrc) {
          setUpdateAvailable(true);
        }
      } catch {
        // Update checks are best effort; the app should keep working offline or behind flaky RPC/network.
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(checkForUpdate, 60_000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="app-update-notice" role="status" aria-live="polite">
      <span>A new AuraOn version is available.</span>
      <button onClick={() => window.location.reload()} type="button">
        Refresh
      </button>
    </div>
  );
}
