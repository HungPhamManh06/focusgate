"use client";

import { Copy, HandHeart, Lock, LockOpen, Timer, UserPlus, Users } from "lucide-react";
import { useState, useTransition } from "react";
import {
  acceptPartnerInviteAction,
  createPartnerInviteAction,
  sendPartnerCheerAction,
} from "@/lib/actions/v4";
import type { PartnerStatusItem } from "@/lib/data/v4-ecosystem";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function AccountabilityCard({
  pendingInviteCode,
  partners,
}: {
  pendingInviteCode: string | null;
  partners: PartnerStatusItem[];
}) {
  const isVi = useLocale() === "vi";
  const [inviteCode, setInviteCode] = useState(pendingInviteCode);
  const [joinCode, setJoinCode] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleGenerate = () => {
    startTransition(async () => {
      const res = await createPartnerInviteAction();
      if (res.error) toast.push("error", res.error);
      else if (res.data?.code) {
        setInviteCode(res.data.code);
        toast.push("success", isVi ? `Đã tạo mã mời ${res.data.code}` : `Invite code: ${res.data.code}`);
      }
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    startTransition(async () => {
      const res = await acceptPartnerInviteAction(joinCode);
      if (res.error) toast.push("error", res.error);
      else {
        setJoinCode("");
        toast.push("success", isVi ? "Đã ghép đôi bạn đồng hành!" : "Paired with partner!");
      }
    });
  };

  const handleCheer = (partnerUserId: string) => {
    startTransition(async () => {
      const msg = isVi
        ? "Cụng ly! Giữ vững nhịp tập trung nhé 🔥"
        : "Cheers! Keep your gate locked & stay strong 🔥";
      const res = await sendPartnerCheerAction(partnerUserId, msg);
      if (res.error) toast.push("error", res.error);
      else toast.push("success", isVi ? "Đã gửi lời cổ vũ!" : "Cheer sent!");
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-accent" />
          {isVi ? "Bạn đồng hành (Co-Focus)" : "Accountability Partner (Co-Focus)"}
        </CardTitle>
        <Badge tone="neutral">
          {isVi ? `${partners.length} kết nối` : `${partners.length} paired`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {partners.length > 0 ? (
          <div className="space-y-2.5">
            {partners.map((p) => (
              <div
                key={p.partnershipId}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-ink">{p.displayName}</p>
                    <Badge
                      tone={
                        p.gateStatus === "focusing"
                          ? "accent"
                          : p.gateStatus === "locked"
                            ? "warning"
                            : "success"
                      }
                    >
                      {p.gateStatus === "focusing" ? (
                        <Timer className="mr-1 size-3" />
                      ) : p.gateStatus === "locked" ? (
                        <Lock className="mr-1 size-3" />
                      ) : (
                        <LockOpen className="mr-1 size-3" />
                      )}
                      {p.gateStatus === "focusing"
                        ? isVi
                          ? "Đang tập trung"
                          : "Focusing"
                        : p.gateStatus === "locked"
                          ? isVi
                            ? "Đang khóa cổng"
                            : "Gate locked"
                          : isVi
                            ? "Đã mở cổng"
                            : "Gate open"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    {isVi
                      ? `Còn ${p.remainingTasks} việc · đã xong ${p.completedToday} việc hôm nay`
                      : `${p.remainingTasks} tasks left · ${p.completedToday} done today`}
                  </p>
                  {p.lastCheer && (
                    <p className="mt-1 text-[11px] italic text-accent">“{p.lastCheer.message}”</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => handleCheer(p.partnerUserId)}
                >
                  <HandHeart className="size-3.5" /> {isVi ? "Cổ vũ" : "Cheer"}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted">
            {isVi
              ? "Mời 1 người bạn cùng khóa cổng. Chỉ hiển thị trạng thái Cổng và số task còn lại — tuyệt đối bảo mật tên việc cá nhân."
              : "Pair with a friend to lock gates together. Only gate status & remaining count are shared — task titles stay private."}
          </p>
        )}

        <div className="grid gap-2.5 border-t border-line pt-3 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            {inviteCode ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-between font-mono"
                onClick={() => {
                  navigator.clipboard?.writeText(inviteCode).catch(() => undefined);
                  toast.push("success", isVi ? "Đã copy mã mời!" : "Invite code copied!");
                }}
              >
                <span>{inviteCode}</span>
                <Copy className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                className="w-full"
                onClick={handleGenerate}
              >
                <UserPlus className="size-3.5" /> {isVi ? "Tạo mã mời 6 ký tự" : "Generate invite code"}
              </Button>
            )}
          </div>

          <form onSubmit={handleJoin} className="flex gap-1.5">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={isVi ? "Nhập mã FG-..." : "Enter FG-... code"}
              className="font-mono uppercase"
              disabled={pending}
            />
            <Button type="submit" size="sm" variant="accent" disabled={pending || !joinCode.trim()}>
              {isVi ? "Ghép" : "Join"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
