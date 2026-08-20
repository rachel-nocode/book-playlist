"use client";

import { useEffect } from "react";

export function LocalHostRedirect() {
  useEffect(() => {
    if (window.location.hostname !== "localhost") {
      return;
    }

    const url = new URL(window.location.href);
    url.hostname = "127.0.0.1";
    window.location.replace(url.toString());
  }, []);

  return null;
}
