"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { greetingForDate } from "@/lib/data/format";

function computeLocalHeaderState() {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return {
    dateLabel,
    greetingText: greetingForDate(now),
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
  const [header, setHeader] = useState({
    dateLabel: initialDateLabel,
    greetingText: initialGreeting,
  });

  useEffect(() => {
    const sync = () => {
      const next = computeLocalHeaderState();
      setHeader((prev) =>
        prev.dateLabel === next.dateLabel && prev.greetingText === next.greetingText
          ? prev
          : next,
      );
    };

    sync();
    const timer = window.setInterval(sync, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <PageHeader
      eyebrow={header.dateLabel}
      title={`${header.greetingText}, ${firstName}.`}
      description={description}
    />
  );
}
