import { Id } from "../../convex/_generated/dataModel";

const KEY = "book-playlist:library";
const MAX_ITEMS = 50;

export function readLocalLibrary(): Id<"books">[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const ids: Id<"books">[] = [];
    for (const value of parsed) {
      if (typeof value === "string" && value.length > 0) {
        ids.push(value as Id<"books">);
      }
    }
    return ids.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function addToLocalLibrary(bookId: Id<"books">): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = [bookId, ...readLocalLibrary().filter((id) => id !== bookId)].slice(
    0,
    MAX_ITEMS
  );
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function removeFromLocalLibrary(bookId: Id<"books">): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    KEY,
    JSON.stringify(readLocalLibrary().filter((id) => id !== bookId))
  );
}
