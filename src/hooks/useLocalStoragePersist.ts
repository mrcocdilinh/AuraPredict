import { useEffect } from "react";

export function useLocalStoragePersist<T>(key: string, value: T) {
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be full or unavailable
    }
  }, [key, value]);
}
