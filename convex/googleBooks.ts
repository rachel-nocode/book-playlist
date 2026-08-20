import { action } from "./_generated/server";
import { v } from "convex/values";

const searchResult = v.object({
  googleBooksId: v.string(),
  title: v.string(),
  author: v.string(),
  coverUrl: v.union(v.string(), v.null()),
  genreTags: v.array(v.string()),
});

export const searchByTitle = action({
  args: { title: v.string() },
  returns: v.array(searchResult),
  handler: async (_ctx, args) => {
    const title = args.title.trim();
    if (!title) {
      throw new Error("Enter a book title");
    }

    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", `intitle:${title}`);
    url.searchParams.set("maxResults", "5");
    url.searchParams.set("printType", "books");

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    if (apiKey) {
      url.searchParams.set("key", apiKey);
    }

    const response = await fetch(url.toString());
    if (response.status === 403 || response.status === 429) {
      return searchOpenLibrary(title);
    }

    if (!response.ok) {
      throw new Error(await googleBooksError(response));
    }

    const data: unknown = await response.json();
    return parseSearchResults(data).slice(0, 5);
  },
});

async function searchOpenLibrary(title: string) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", title);
  url.searchParams.set("limit", "5");
  url.searchParams.set("fields", "key,title,author_name,subject,cover_i");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      "Book search is temporarily unavailable. Please try again shortly."
    );
  }

  const data: unknown = await response.json();
  return parseOpenLibraryResults(data);
}

function parseSearchResults(data: unknown) {
  if (typeof data !== "object" || data === null || !("items" in data)) {
    return [];
  }

  const items = (data as { items: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const results: Array<{
    googleBooksId: string;
    title: string;
    author: string;
    coverUrl: string | null;
    genreTags: string[];
  }> = [];

  for (const item of items) {
    const parsed = parseVolume(item);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

function parseOpenLibraryResults(data: unknown) {
  if (typeof data !== "object" || data === null || !("docs" in data)) {
    return [];
  }

  const docs = (data as { docs: unknown }).docs;
  if (!Array.isArray(docs)) {
    return [];
  }

  return docs.flatMap((doc) => {
    if (typeof doc !== "object" || doc === null) {
      return [];
    }

    const record = doc as Record<string, unknown>;
    if (typeof record.key !== "string" || typeof record.title !== "string") {
      return [];
    }

    const authors = Array.isArray(record.author_name)
      ? record.author_name.filter(
          (author): author is string => typeof author === "string"
        )
      : [];
    const subjects = Array.isArray(record.subject)
      ? record.subject.filter(
          (subject): subject is string => typeof subject === "string"
        )
      : [];
    const coverUrl =
      typeof record.cover_i === "number"
        ? `https://covers.openlibrary.org/b/id/${record.cover_i}-M.jpg`
        : null;

    return [
      {
        googleBooksId: `openlibrary:${record.key}`,
        title: record.title,
        author: authors.join(", ") || "Unknown author",
        coverUrl,
        genreTags: subjects.slice(0, 10),
      },
    ];
  });
}

function parseVolume(item: unknown) {
  if (typeof item !== "object" || item === null) {
    return null;
  }

  const record = item as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }

  const volumeInfo = record.volumeInfo;
  if (typeof volumeInfo !== "object" || volumeInfo === null) {
    return null;
  }

  const info = volumeInfo as Record<string, unknown>;
  if (typeof info.title !== "string" || !info.title.trim()) {
    return null;
  }

  const authors = Array.isArray(info.authors)
    ? info.authors.filter((author): author is string => typeof author === "string")
    : [];

  const categories = Array.isArray(info.categories)
    ? info.categories.filter((category): category is string => typeof category === "string")
    : [];

  const imageLinks =
    typeof info.imageLinks === "object" && info.imageLinks !== null
      ? (info.imageLinks as Record<string, unknown>)
      : null;

  const rawCover =
    (typeof imageLinks?.thumbnail === "string" && imageLinks.thumbnail) ||
    (typeof imageLinks?.smallThumbnail === "string" && imageLinks.smallThumbnail) ||
    null;

  return {
    googleBooksId: record.id,
    title: info.title.trim(),
    author: authors.join(", ") || "Unknown author",
    coverUrl: toHttps(rawCover),
    genreTags: categories,
  };
}

function toHttps(url: string | null): string | null {
  if (!url) {
    return null;
  }
  return url.replace(/^http:\/\//i, "https://");
}

async function googleBooksError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const message = readGoogleMessage(body);

  if (response.status === 403 || response.status === 429) {
    return (
      message ??
      "Google Books quota exceeded. Set GOOGLE_BOOKS_API_KEY in the Convex dashboard."
    );
  }

  return message ?? "Google Books search failed";
}

function readGoogleMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return null;
  }
  const error = (body as { error: unknown }).error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return null;
}
