import Link from "next/link";
import { ArrowRight, Chrome, Laptop, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { LandingGateDemo } from "@/components/domain/landing-gate-demo";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "FocusGate — Hoàn thành nhiệm vụ. Tự do giải trí.",
  description:
    "Hệ sinh thái kỷ luật đồng bộ Web, Android, Windows và trình duyệt. Khóa xao nhãng cho đến khi xong việc quan trọng.",
};

export default function WelcomeLandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-white">
            <ShieldCheck className="size-4" />
          </span>
          <span className="text-[16px] font-bold tracking-tight">FocusGate</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Đăng nhập
          </Link>
          <Link href="/" className={buttonVariants({ variant: "accent", size: "sm" })}>
            Vào ứng dụng <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-[12px] font-semibold text-accent">
              <Sparkles className="size-3.5" /> The Living Gate · Earned Freedom
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Hoàn thành việc quan trọng.{" "}
              <span className="text-accent">Tự do giải trí không tội lỗi.</span>
            </h1>
            <p className="text-[15px] leading-relaxed text-muted">
              FocusGate kết nối Web, Android, Windows và Chrome/Edge thành một cánh cổng kỷ luật
              thống nhất: tự động khóa mạng xã hội khi bạn chưa xong việc Bắt buộc, và mở khóa cùng
              phút thưởng xứng đáng ngay khi hoàn thành.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/" className={buttonVariants({ variant: "accent", size: "lg" })}>
                Bắt đầu ngay miễn phí <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Đăng nhập tài khoản
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <LandingGateDemo />
          </div>
        </div>

        {/* FocusGate 10.0: Before / After Focus Day Comparison */}
        <section className="mt-16 rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Before &amp; After
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              Một ngày bị phân mảnh vs. Một ngày có FocusGate
            </h2>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface-2/50 p-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                Trước đây · Mất kiểm soát chú ý
              </p>
              <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full bg-surface">
                <div className="w-[15%] bg-ink/40" />
                <div className="w-[25%] bg-danger/55" />
                <div className="w-[12%] bg-ink/40" />
                <div className="w-[30%] bg-danger/55" />
                <div className="w-[18%] bg-warning/60" />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                Chuyển tab liên tục giữa công việc và mạng xã hội, kết thúc ngày trong cảm giác bận
                rộn nhưng chưa xong việc trọng tâm.
              </p>
            </div>
            <div className="rounded-2xl border border-accent/35 bg-accent-soft/35 p-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent">
                Với FocusGate · Làm sâu, hưởng trọn
              </p>
              <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full bg-surface">
                <div className="w-[38%] bg-accent" />
                <div className="w-[8%] bg-surface-2" />
                <div className="w-[32%] bg-accent" />
                <div className="w-[22%] bg-success" />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
                Khóa xao nhãng theo kế hoạch Bắt buộc, hoàn thành 2–3 khối tập trung sâu rồi mở khóa
                giải trí hoàn toàn xứng đáng.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <Smartphone className="size-5 text-accent" />
            <h3 className="mt-3 text-[15px] font-bold">Android Native Guard</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Quick Settings Tile 1 chạm, đồng hồ màn hình khóa, Giờ Ngủ tự động (Bedtime Gate), chế
              độ Nghiêm khắc và tự cập nhật ngay trong app.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <Laptop className="size-5 text-accent" />
            <h3 className="mt-3 text-[15px] font-bold">Windows Desktop Agent</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Chặn ứng dụng/game giải trí trên Windows, đồng hồ tập trung nổi góc màn hình và đồng
              bộ trạng thái Cổng thời gian thực.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <Chrome className="size-5 text-accent" />
            <h3 className="mt-3 text-[15px] font-bold">YouTube Study Mode</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Tiện ích Chrome/Edge ẩn hoàn toàn trang chủ gợi ý, Shorts và cột đề xuất trên YouTube
              để bạn chỉ tập trung xem bài giảng.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
