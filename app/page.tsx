import { BookSearch } from "./book-search";
import { LocalHostRedirect } from "./local-host-redirect";
import { SavedPlaylists } from "./saved-playlists";
import { SiteHeader } from "./site-header";

export default function Home() {
  return (
    <main className="min-h-dvh text-foreground">
      <LocalHostRedirect />
      <SiteHeader />
      <div className="page-shell flex flex-col gap-12 pb-16 pt-8 sm:pt-12">
        <section className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            A darker Goodreads, with music
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
            What are you reading?
          </h1>
          <p className="mt-4 text-base text-ink sm:text-lg">
            Search a book. We’ll score a soundtrack from its world, mood, and genre.
          </p>
        </section>

        <section>
          <BookSearch />
        </section>

        <SavedPlaylists />
      </div>
    </main>
  );
}
