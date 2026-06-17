export function timeAgo(timestamp: number, now: Date) {
  if (timestamp <= 0) return "";
  const elapsed = Math.max(0, Math.floor((now.getTime() - timestamp * 1000) / 1000));
  if (elapsed < 60) return `${elapsed}s ago`;
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
