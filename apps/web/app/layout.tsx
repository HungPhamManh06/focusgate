import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FocusGate — Finish your tasks. Earn your freedom.",
    template: "%s · FocusGate",
  },
  description:
    "FocusGate turns focused work into earned entertainment time. Plan the day, protect your attention, and unlock what you actually want to do.",
  applicationName: "FocusGate",
};

const themeBootstrap = `(function(){try{var stored=localStorage.getItem("focusgate-theme");var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
