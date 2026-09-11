import { Id } from "../../convex/_generated/dataModel";

const KEY = "book-playlist:library";
const CHANGE_EVENT = "book-playlist:library-changed";
const MAX_ITEMS = 50;

type LocalEntry = {
  bookId: Id<"books">;
  googleBooksId?: string;
};

function readEntries(): LocalEntry[] {
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
    const entries: LocalEntry[] = [];
    for (const value of parsed) {
      if (typeof value === "string" && value.length > 0) {
        entries.push({ bookId: value as Id<"books"> });
        continue;
      }
      if (
        typeof value === "object" &&
        value !== null &&
        "bookId" in value &&
        typeof value.bookId === "string" &&
        value.bookId.length > 0
      ) {
        const googleBooksId =
          "googleBooksId" in value && typeof value.googleBooksId === "string"
            ? value.googleBooksId
            : undefined;
        entries.push({
          bookId: value.bookId as Id<"books">,
          googleBooksId,
        });
      }
    }
    return entries.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeEntries(entries: LocalEntry[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeLocalLibrary(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const onChange = () => listener();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readLocalLibrary(): Id<"books">[] {
  return readEntries().map((entry) => entry.bookId);
}

export function findLocalBook(googleBooksId: string): Id<"books"> | undefined {
  return readEntries().find((entry) => entry.googleBooksId === googleBooksId)
    ?.bookId;
}

export function localLibraryByGoogleId(): Record<string, Id<"books">> {
  const byGoogleId: Record<string, Id<"books">> = {};
  for (const entry of readEntries()) {
    if (entry.googleBooksId) {
      byGoogleId[entry.googleBooksId] = entry.bookId;
    }
  }
  return byGoogleId;
}

export function addToLocalLibrary(
  bookId: Id<"books">,
  googleBooksId: string
): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = [
    { bookId, googleBooksId },
    ...readEntries().filter(
      (entry) =>
        entry.bookId !== bookId && entry.googleBooksId !== googleBooksId
    ),
  ];
  writeEntries(next);
}

export function removeFromLocalLibrary(bookId: Id<"books">): void {
  if (typeof window === "undefined") {
    return;
  }
  writeEntries(readEntries().filter((entry) => entry.bookId !== bookId));
}
