import Link from "next/link";
import { AppleMusicConnect } from "./apple-music-connect";
import { SpotifyConnect } from "./spotify-connect";

export function SiteHeader() {
  return (
    <header className="border-b border-rule/80 bg-[#18140f]/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <Link href="/" className="focus-ring group min-w-0">
          <span className="block font-serif text-xl tracking-tight text-gold sm:text-2xl">
            Book Playlist
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-ink sm:block">
            Soundtracks for whatever you’re reading
          </span>
        </Link>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <AppleMusicConnect compact />
          <SpotifyConnect compact />
        </div>
      </div>
    </header>
  );
}
