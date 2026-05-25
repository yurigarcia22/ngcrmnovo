import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { cookies } from "next/headers";
import { getTenantContext } from "@/lib/tenant-context";

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const ctx = await getTenantContext();

    if (!ctx) {
        redirect("/login");
    }

    const cookieStore = await cookies();
    const sidebarState = cookieStore.get("sidebar_state");
    const initialOpen = sidebarState ? sidebarState.value === "true" : true;

    return (
        <div className="flex h-screen" suppressHydrationWarning>
            <Sidebar initialOpen={initialOpen} modules={ctx.modules} />
            <main className="flex-1 overflow-y-auto h-full">
                {children}
            </main>
        </div>
    );
}
