"use server";

import { redirect } from "next/navigation";
import { signOutAdmin } from "@/lib/admin-auth";

export async function adminLogoutAction(): Promise<void> {
    await signOutAdmin();
    redirect("/admin/login");
}
