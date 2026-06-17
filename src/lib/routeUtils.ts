import { MARKET_QUERY_KEY, PROFILE_QUERY_KEY } from "../constants";

export function updateMarketRoute(marketId: number | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete(PROFILE_QUERY_KEY);
  if (marketId === null) {
    url.searchParams.delete(MARKET_QUERY_KEY);
  } else {
    url.searchParams.set(MARKET_QUERY_KEY, String(marketId));
  }
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function updateProfileRoute(address: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete(MARKET_QUERY_KEY);
  if (address) {
    url.searchParams.set(PROFILE_QUERY_KEY, address);
  } else {
    url.searchParams.delete(PROFILE_QUERY_KEY);
  }
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
}
