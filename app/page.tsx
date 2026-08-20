import { BookSearch } from "./book-search";
import { LocalHostRedirect } from "./local-host-redirect";
import { SavedPlaylists } from "./saved-playlists";
import { SpotifyConnect } from "./spotify-connect";

export default function Home() {
  return (
    <main className="min-h-dvh bg-black px-4 py-4 text-white sm:px-6 lg:px-8">
      <LocalHostRedirect />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="flex items-center justify-between px-1 py-2">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-[#1ed760] text-lg font-black text-black">
              B
            </span>
            <span className="text-lg font-black tracking-tight">Book Playlist</span>
          </div>
          <span className="hidden rounded-full bg-[#181818] px-3 py-1.5 text-xs font-semibold text-white/60 sm:block">
            Your reading soundtrack
          </span>
        </header>

        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#315b47] via-[#1c3329] to-[#121212] px-5 py-8 sm:px-8 sm:py-10">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-[#1ed760]/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9f5cd]">
              Book to playlist
            </p>
            <h1 className="mt-3 text-balance text-4xl font-black leading-none tracking-tight sm:text-5xl">
              Find the sound of your next read.
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/75 sm:text-lg">
              Search for a book and turn its world, mood, and genre into a playlist.
            </p>
            <div className="mt-6">
              <SpotifyConnect />
            </div>
          </div>
        </section>

        <section className="spotify-surface p-4 sm:p-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                Discover
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Start with a book</h2>
            </div>
            <span className="hidden text-sm text-white/45 sm:block">We’ll handle the vibe.</span>
          </div>
          <BookSearch />
        </section>

        <section className="spotify-surface p-4 sm:p-5">
          <SavedPlaylists />
        </section>
      </div>
    </main>
  );
}
