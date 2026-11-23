import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FocusGate — Finish your tasks. Earn your freedom.",
    short_name: "FocusGate",
    description:
      "FocusGate turns focused work into earned entertainment time. Plan the day, protect your attention, and unlock what you actually want to do.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F5",
    theme_color: "#B91C1C",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
