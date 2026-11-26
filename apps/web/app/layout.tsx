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

const themeBootstrap = `(function(){try{var stored=localStorage.getItem("focusgate-theme");var preset=localStorage.getItem("focusgate-preset");var density=localStorage.getItem("focusgate-density");var font=localStorage.getItem("focusgate-font");var accent=localStorage.getItem("focusgate-accent");var radius=localStorage.getItem("focusgate-radius");var texture=localStorage.getItem("focusgate-texture");var autoSunset=localStorage.getItem("focusgate-auto-sunset")==="1";var hr=new Date().getHours();var dark=autoSunset?(hr>=19||hr<6):(stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);if(!autoSunset&&(preset==="matcha"||preset==="nordic")){document.documentElement.setAttribute("data-preset",preset);}if(density==="compact"){document.documentElement.setAttribute("data-density","compact");}if(font==="sans"){document.documentElement.setAttribute("data-font","sans");}if(accent&&accent!=="default"){document.documentElement.setAttribute("data-accent",accent);}if(radius==="sharp"){document.documentElement.setAttribute("data-radius","sharp");}if(texture==="dots"||texture==="paper"){document.documentElement.setAttribute("data-texture",texture);}}catch(e){}})();`;

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
