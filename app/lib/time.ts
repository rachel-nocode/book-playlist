export const HOUR_MS = 60 * 60 * 1000;

export function generatedAgoLabel(timestamp: number, now: number): string {
  const hours = Math.max(0, Math.floor((now - timestamp) / HOUR_MS));
  if (hours < 1) {
    return "generated less than 1 hour ago";
  }
  if (hours === 1) {
    return "generated 1 hour ago";
  }
  return `generated ${hours} hours ago`;
}
