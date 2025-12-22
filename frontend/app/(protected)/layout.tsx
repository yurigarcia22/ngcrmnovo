import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { cookies } from "next/headers";

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const cookieStore = await cookies();
    const sidebarState = cookieStore.get("sidebar_state");
    const initialOpen = sidebarState ? sidebarState.value === "true" : true;

    return (
        <div className="flex h-screen" suppressHydrationWarning>
            <Sidebar initialOpen={initialOpen} />
            <main className="flex-1 overflow-y-auto h-full">
                {children}
            </main>
        </div>
    );
}
