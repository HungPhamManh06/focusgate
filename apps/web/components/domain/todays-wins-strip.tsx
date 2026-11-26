import { CheckCircle2, Trophy } from "lucide-react";

export function TodaysWinsStrip({
  completedTitles,
  locale = "en",
}: {
  completedTitles: string[];
  locale?: "en" | "vi";
}) {
  if (completedTitles.length === 0) return null;
  const isVi = locale === "vi";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-success/25 bg-success-soft/45 px-4 py-2.5 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
        <Trophy className="size-3.5" />
        {isVi
          ? `Chiến thắng hôm nay (${completedTitles.length}):`
          : `Today's wins (${completedTitles.length}):`}
      </span>
      {completedTitles.slice(0, 4).map((title, idx) => (
        <span
          key={`${title}-${idx}`}
          className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border border-success/25 bg-surface/90 px-2.5 py-0.5 text-[11px] text-ink-soft"
        >
          <CheckCircle2 className="size-3 shrink-0 text-success" />
          <span className="truncate">{title}</span>
        </span>
      ))}
      {completedTitles.length > 4 ? (
        <span className="text-[11px] font-medium text-success">
          +{completedTitles.length - 4}
        </span>
      ) : null}
    </div>
  );
}
