"use client";

import { Check, Lock, Shield, Sparkles, Timer, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboardingAction } from "@/lib/actions/v5";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const TOP_DISTRACTORS = [
  "YouTube",
  "TikTok",
  "Facebook",
  "Instagram",
  "Reddit",
  "X / Twitter",
];

export function OnboardingTourModal({
  initiallyOpen,
}: {
  initiallyOpen: boolean;
}) {
  const isVi = useLocale() === "vi";
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<string[]>(["YouTube", "TikTok", "Facebook"]);
  const [gateTested, setGateTested] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (!open) return null;

  const toggleDistractor = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  };

  const finishTour = (goToFocus: boolean) => {
    startTransition(async () => {
      await completeOnboardingAction();
      setOpen(false);
      toast.push(
        "success",
        isVi ? "Chào mừng bạn đến với FocusGate!" : "Welcome to FocusGate!",
      );
      if (goToFocus) router.push("/focus");
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
            <Sparkles className="size-3" />
            {isVi ? `Khởi động 60 giây · Bước ${step}/3` : `60-Second Setup · Step ${step}/3`}
          </span>
          <button
            type="button"
            onClick={() => finishTour(false)}
            className="rounded-lg p-1 text-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === 1 && (
          <div className="mt-4 space-y-3">
            <h2 className="text-[18px] font-bold text-ink">
              {isVi ? "Chọn 3 ứng dụng làm bạn mất tập trung nhất" : "Pick your top 3 distractors"}
            </h2>
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "FocusGate sẽ khóa những ứng dụng này cho đến khi bạn hoàn thành việc Bắt buộc trong ngày."
                : "FocusGate keeps these locked until your daily Must-Do plan is complete."}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {TOP_DISTRACTORS.map((item) => {
                const active = selected.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleDistractor(item)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-surface-2/60 text-ink hover:border-accent/40"
                    }`}
                  >
                    {active && <Check className="size-3" />}
                    {item}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-3">
              <Button type="button" variant="accent" onClick={() => setStep(2)}>
                {isVi ? "Tiếp theo →" : "Next →"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <h2 className="text-[18px] font-bold text-ink">
              {isVi ? "Nghi thức Khóa Cổng" : "The Gate Lock Ritual"}
            </h2>
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "Mỗi sáng, bạn chỉ cần chốt 2–3 việc Bắt buộc và Khóa Cổng. Xong việc, Cổng tự mở cùng Vé Giải Trí Không Tội Lỗi."
                : "Each morning, commit 2–3 Must-Do tasks and lock the Gate. Finish them to earn Guilt-Free Leisure."}
            </p>
            <button
              type="button"
              onClick={() => setGateTested(true)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border py-4 text-[13.5px] font-semibold transition-all ${
                gateTested
                  ? "border-success bg-success-soft text-success"
                  : "border-accent bg-accent text-white hover:opacity-95"
              }`}
            >
              {gateTested ? (
                <>
                  <Shield className="size-4" />{" "}
                  {isVi ? "Cổng đã khóa! Bạn đã sẵn sàng." : "Gate locked! You're ready."}
                </>
              ) : (
                <>
                  <Lock className="size-4" />{" "}
                  {isVi ? "Bấm thử Khóa Cổng ngay" : "Tap to test Gate Lock"}
                </>
              )}
            </button>
            <div className="flex justify-between pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                {isVi ? "← Quay lại" : "← Back"}
              </Button>
              <Button type="button" variant="accent" onClick={() => setStep(3)}>
                {isVi ? "Tiếp theo →" : "Next →"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 space-y-3">
            <h2 className="text-[18px] font-bold text-ink">
              {isVi ? "Bắt đầu phiên khởi động 5 phút?" : "Start your first 5-minute sprint?"}
            </h2>
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "Mọi thói quen lớn đều bắt đầu từ 5 phút tập trung đầu tiên. Bạn có thể mở Ambient Focus Studio ngay bây giờ."
                : "Every streak begins with 5 focused minutes. Jump straight into Ambient Focus Studio now."}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => finishTour(true)}
              >
                <Timer className="size-4" />{" "}
                {isVi ? "Vào Focus Studio ngay" : "Launch Focus Studio"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => finishTour(false)}
              >
                {isVi ? "Để sau, vào Tổng quan" : "Skip to Dashboard"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
