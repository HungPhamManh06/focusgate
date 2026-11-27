interface DisciplineScoreRingProps {
  activeDays: number;
  periodDays: number;
  focusMinutes: number;
  completionRate: number;
  locale: "en" | "vi";
}

/**
 * FocusGate 14.0: Composite 0–100 Discipline Score Ring on /statistics.
 */
export function DisciplineScoreRing({
  activeDays,
  periodDays,
  focusMinutes,
  completionRate,
  locale,
}: DisciplineScoreRingProps) {
  const isVi = locale === "vi";
  const consistencyScore = Math.min(40, Math.round((activeDays / Math.max(1, periodDays)) * 40));
  const targetFocus = Math.max(60, periodDays * 45);
  const focusScore = Math.min(35, Math.round((focusMinutes / targetFocus) * 35));
  const completionScore = Math.min(25, Math.round((Math.min(100, Math.max(0, completionRate)) / 100) * 25));
  const totalScore = Math.min(100, consistencyScore + focusScore + completionScore);

  const grade =
    totalScore >= 85 ? "S" : totalScore >= 70 ? "A" : totalScore >= 50 ? "B" : "C";
  const gradeTone =
    grade === "S"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : grade === "A"
        ? "bg-accent/15 text-accent border-accent/30"
        : grade === "B"
          ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
          : "bg-surface-2 text-muted border-line";

  const circumference = 2 * Math.PI * 34;
  const strokeDashoffset = circumference * (1 - totalScore / 100);

  return (
    <section
      className="spotlight-card mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
      aria-label={isVi ? "Điểm kỷ luật tổng hợp" : "Composite discipline score"}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex size-20 shrink-0 items-center justify-center">
          <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={grade === "S" ? "var(--success)" : "var(--accent)"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <span className="absolute text-[19px] font-bold text-ink tabular-nums">{totalScore}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink">
              {isVi ? "Điểm Kỷ luật FocusGate" : "FocusGate Discipline Score"}
            </h2>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${gradeTone}`}>
              {isVi ? `Hạng ${grade}` : `Rank ${grade}`}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            {isVi
              ? `Đều đặn ${activeDays}/${periodDays} ngày · ${focusMinutes}p tập trung · ${completionRate}% hoàn thành việc.`
              : `Consistent ${activeDays}/${periodDays} days · ${focusMinutes}m focused · ${completionRate}% task completion.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[250px]">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">{isVi ? "Đều đặn" : "Streak"}</p>
          <p className="mt-0.5 text-[13.5px] font-bold text-ink tabular-nums">{consistencyScore}/40</p>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">{isVi ? "Tập trung" : "Focus"}</p>
          <p className="mt-0.5 text-[13.5px] font-bold text-ink tabular-nums">{focusScore}/35</p>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted">{isVi ? "Hoàn thành" : "Done"}</p>
          <p className="mt-0.5 text-[13.5px] font-bold text-ink tabular-nums">{completionScore}/25</p>
        </div>
      </div>
    </section>
  );
}
