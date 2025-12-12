"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
    const supabase = await createClient();
    const fullName = formData.get("fullName") as string;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: "Usuário não autenticado" };
    }

    try {
        const { error } = await supabase
            .from("profiles")
            .update({ full_name: fullName })
            .eq("id", user.id);

        if (error) throw error;

        revalidatePath("/settings/profile");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
