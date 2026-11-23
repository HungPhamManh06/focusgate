"use client";

import { NotebookPen, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { saveFocusSessionNoteAction } from "@/lib/actions/v2";
import type { FocusNoteItem } from "@/lib/data/v3-features";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SessionNotesCard({ items }: { items: FocusNoteItem[] }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) {
      init[item.id] = item.note ?? "";
    }
    return init;
  });

  if (items.length === 0) return null;

  const handleSave = (sessionId: string) => {
    startTransition(async () => {
      const res = await saveFocusSessionNoteAction(sessionId, drafts[sessionId] ?? "");
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="size-4 text-accent" />
          Session Journal &amp; Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-line bg-surface-2/40 p-3"
          >
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="font-medium text-ink">
                {item.taskTitle ?? "Free Focus Session"}
              </span>
              <span className="text-muted">
                {item.creditedMinutes}m ·{" "}
                {new Date(item.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={drafts[item.id] ?? ""}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                }
                placeholder="What did you finish? What is the next step?"
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => handleSave(item.id)}
              >
                <Save className="size-3.5" /> Save
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
