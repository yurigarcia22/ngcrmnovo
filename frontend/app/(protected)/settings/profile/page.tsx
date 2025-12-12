import { createClient } from "@/utils/supabase/server";
import { User, Mail, Phone, Lock, Save } from "lucide-react";
import { updateProfile } from "./actions";
import PasswordUpdateForm from "./PasswordUpdateForm";

export default async function ProfilePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let profile = null;
    if (user) {
        const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();
        profile = data;
    }

    async function handleSave(formData: FormData) {
        "use server";
        await updateProfile(formData);
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Meu Perfil</h1>
            <p className="text-gray-500 mb-8">Gerencie suas informações pessoais e de login.</p>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-100 flex items-center gap-6">
                    <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-3xl font-bold text-blue-600 border-4 border-white shadow-lg">
                        {profile?.full_name?.[0]?.toUpperCase() || <User size={40} />}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{profile?.full_name || "Usuário"}</h2>
                        <p className="text-gray-500">{user?.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Membro desde {new Date(user?.created_at || "").toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="p-8">
                    <form action={handleSave} className="space-y-6 max-w-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Nome Completo</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        name="fullName"
                                        type="text"
                                        defaultValue={profile?.full_name || ""}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        placeholder="Seu nome completo"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        disabled
                                        defaultValue="+55"
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="email"
                                    disabled
                                    defaultValue={user?.email || ""}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                            >
                                <Save size={18} />
                                Salvar Alterações
                            </button>
                        </div>
                    </form>

                    {/* Password Section independent of the main form */}
                    <PasswordUpdateForm />
                </div>
            </div>
        </div>
    );
}
