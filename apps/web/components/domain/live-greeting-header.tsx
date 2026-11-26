"use client";

import { useEffect, useState } from "react";
import { useLocale, type AppLocale } from "@/components/i18n/language-provider";
import { PageHeader } from "@/components/ui/page-header";
import { greetingForDate } from "@/lib/data/format";

function computeLocalHeaderState(locale: AppLocale) {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return {
    dateLabel,
    greetingText: greetingForDate(now, undefined, locale),
  };
}

export function LiveGreetingHeader({
  firstName,
  initialDateLabel,
  initialGreeting,
  description,
}: {
  firstName: string;
  initialDateLabel: string;
  initialGreeting: string;
  description: string;
}) {
  const locale = useLocale();
  const [header, setHeader] = useState({
    dateLabel: initialDateLabel,
    greetingText: initialGreeting,
  });
  const [customName, setCustomName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("focusgate-custom-greeting")?.trim();
      if (saved) setCustomName(saved);
    } catch {
      // ignore
    }
    const sync = () => {
      const next = computeLocalHeaderState(locale);
      setHeader((prev) =>
        prev.dateLabel === next.dateLabel && prev.greetingText === next.greetingText
          ? prev
          : next,
      );
    };

    sync();
    const timer = window.setInterval(sync, 30_000);
    return () => window.clearInterval(timer);
  }, [locale]);

  return (
    <PageHeader
      eyebrow={header.dateLabel}
      title={`${header.greetingText}, ${customName || firstName}.`}
      description={description}
    />
  );
}
