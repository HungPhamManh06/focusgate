import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader";
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

const themeBootstrap = `(function(){try{var stored=localStorage.getItem("focusgate-theme");var preset=localStorage.getItem("focusgate-preset");var density=localStorage.getItem("focusgate-density");var font=localStorage.getItem("focusgate-font");var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",dark);if(preset==="matcha"||preset==="nordic"){document.documentElement.setAttribute("data-preset",preset);}if(density==="compact"){document.documentElement.setAttribute("data-density","compact");}if(font==="sans"){document.documentElement.setAttribute("data-font","sans");}}catch(e){}})();`;

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
