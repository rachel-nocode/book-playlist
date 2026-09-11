export type MusicKitInstance = {
  authorize: () => Promise<string | void>;
  isAuthorized: boolean;
  musicUserToken?: string | null;
};

export type MusicKitGlobal = {
  configure: (config: {
    developerToken: string;
    app: { name: string; build: string };
  }) => Promise<MusicKitInstance> | MusicKitInstance;
  getInstance: () => MusicKitInstance;
};

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

const SCRIPT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const LOAD_TIMEOUT_MS = 15_000;

let configuredToken: string | null = null;
let loadPromise: Promise<MusicKitGlobal> | null = null;
let configurePromise: Promise<MusicKitGlobal> | null = null;

export async function prefetchMusicKit(developerToken: string): Promise<void> {
  await ensureConfigured(developerToken);
}

export async function authorizeAppleMusic(): Promise<string> {
  if (typeof window === "undefined" || !window.MusicKit || !configuredToken) {
    throw new Error("Apple Music is still loading. Try again in a moment.");
  }

  const music = window.MusicKit.getInstance();
  if (!music.isAuthorized) {
    const authorized = await music.authorize();
    if (typeof authorized === "string" && authorized.trim()) {
      return authorized;
    }
  }

  const token = music.musicUserToken;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Apple Music did not return a user token");
  }
  return token;
}

async function ensureConfigured(developerToken: string): Promise<MusicKitGlobal> {
  if (configurePromise) {
    return await configurePromise;
  }

  configurePromise = (async () => {
    const MusicKit = await loadMusicKit();
    if (!configuredToken) {
      await Promise.resolve(
        MusicKit.configure({
          developerToken,
          app: {
            name: "Book Playlist",
            build: "1.0.0",
          },
        })
      );
      configuredToken = developerToken;
    }
    return MusicKit;
  })();

  try {
    return await configurePromise;
  } catch (error) {
    configurePromise = null;
    configuredToken = null;
    throw error;
  }
}

function loadMusicKit(): Promise<MusicKitGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Apple Music is only available in the browser"));
  }
  if (window.MusicKit) {
    return Promise.resolve(window.MusicKit);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      loadPromise = null;
      reject(new Error("Apple Music took too long to load"));
    }, LOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      document.removeEventListener("musickitloaded", onReady);
    };

    const onReady = () => {
      cleanup();
      if (window.MusicKit) {
        resolve(window.MusicKit);
      } else {
        loadPromise = null;
        reject(new Error("Apple Music failed to load"));
      }
    };

    document.addEventListener("musickitloaded", onReady, { once: true });

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        cleanup();
        loadPromise = null;
        reject(new Error("Apple Music failed to load"));
      };
      document.head.appendChild(script);
    }
  });

  return loadPromise;
}
