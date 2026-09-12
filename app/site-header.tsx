import Link from "next/link";
import { AppleMusicConnect } from "./apple-music-connect";
import { SpotifyConnect } from "./spotify-connect";

export function SiteHeader() {
  return (
    <header className="border-b border-rule/80 bg-[#18140f]/90 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <Link href="/" className="focus-ring group min-w-0 shrink">
          <span className="block truncate font-serif text-xl tracking-tight text-gold sm:text-2xl">
            Book Playlist
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-ink sm:block">
            Soundtracks for whatever you’re reading
          </span>
        </Link>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <AppleMusicConnect compact />
          <SpotifyConnect compact />
        </div>
      </div>
    </header>
  );
}
