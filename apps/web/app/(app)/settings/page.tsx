import { PageHeader } from "@/components/ui/page-header";
import { getV2Settings } from "@/lib/data/v2-settings";
import { getWorkspace } from "@/lib/data/workspace";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [workspace, settings] = await Promise.all([getWorkspace(), getV2Settings()]);
  const isVi = settings.language === "vi";

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={isVi ? "Cài đặt" : "Settings"}
        title={isVi ? "Cá nhân hóa FocusGate." : "Personalize FocusGate."}
        description={
          isVi
            ? "Chuyển đổi ngôn ngữ Tiếng Việt / English và đặt mục tiêu tập trung, sức khỏe hằng ngày."
            : "Switch between English and Vietnamese, and configure your daily focus and health targets."
        }
      />

      <SettingsForm
        settings={settings}
        displayName={workspace.profile.displayName}
        timezone={workspace.profile.timezone}
      />
    </div>
  );
}
