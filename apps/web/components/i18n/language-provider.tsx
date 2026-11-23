"use client";

import { createContext, useContext } from "react";

export type AppLocale = "en" | "vi";

const LanguageContext = createContext<AppLocale>("en");

export function LanguageProvider({
  language,
  children,
}: {
  language: AppLocale;
  children: React.ReactNode;
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLocale(): AppLocale {
  return useContext(LanguageContext);
}
