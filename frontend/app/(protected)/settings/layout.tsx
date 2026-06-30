import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { getCurrentProfile } from "@/app/actions";

export default async function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const profile = await getCurrentProfile();
    const isAdmin = profile?.role === "admin";

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-800">
            <SettingsSidebar isAdmin={isAdmin} />
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
