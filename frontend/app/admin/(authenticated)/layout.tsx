import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminAuthenticatedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect("/admin/login");
    }

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            <AdminSidebar
                adminName={admin.full_name ?? admin.email}
                adminEmail={admin.email}
            />
            <main className="flex-1 overflow-y-auto h-screen">{children}</main>
        </div>
    );
}
