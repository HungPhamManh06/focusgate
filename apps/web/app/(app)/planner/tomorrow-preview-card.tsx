import { CalendarArrowUp, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PreviewTask = {
  id: string;
  title: string;
  dueDate: string | null;
  isDailyHabit?: boolean;
};

export function TomorrowPreviewCard({
  tasks,
  tomorrowDate,
  locale = "en",
}: {
  tasks: PreviewTask[];
  tomorrowDate: string;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const dueTomorrow = tasks.filter((t) => t.dueDate?.slice(0, 10) === tomorrowDate);
  const habits = tasks.filter((t) => Boolean(t.isDailyHabit));

  if (dueTomorrow.length === 0 && habits.length === 0) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <CalendarArrowUp className="size-4 text-accent" />
          {isVi ? `Xem trước Ngày mai (${tomorrowDate})` : `Tomorrow Preview (${tomorrowDate})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pt-2 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {isVi ? `Đến hạn ngày mai (${dueTomorrow.length})` : `Due tomorrow (${dueTomorrow.length})`}
          </p>
          {dueTomorrow.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-muted">
              {isVi ? "Không có hạn chót nào vào ngày mai." : "No deadlines tomorrow."}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-[12.5px]">
              {dueTomorrow.slice(0, 5).map((t) => (
                <li key={t.id} className="truncate text-ink">
                  • {t.title}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <Repeat className="size-3 text-accent" />
            {isVi ? `Thói quen tự động nạp (${habits.length})` : `Auto-repeating habits (${habits.length})`}
          </p>
          {habits.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-muted">
              {isVi ? "Chưa có thói quen hằng ngày." : "No daily habits yet."}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-[12.5px]">
              {habits.slice(0, 5).map((t) => (
                <li key={t.id} className="truncate text-ink-soft">
                  • {t.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
