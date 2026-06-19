"use client";

import { useState, useEffect } from "react";
import { getMembers, inviteMember, revokeInvite, removeMember, updateMemberRole } from "./actions";
import { User, Plus, Mail, Shield, Clock, CheckCircle, Trash2, Users } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";

export default function TeamPage() {
    const [members, setMembers] = useState<any[]>([]);
    const [invites, setInvites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteLoading, setInviteLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    const supabase = createClient();
    const confirm = useConfirm();

    useEffect(() => {
        fetchData();
        getCurrentUser();
    }, []);

    useEffect(() => {
        if (!isInviteModalOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsInviteModalOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isInviteModalOpen]);

    async function getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
    }

    async function fetchData() {
        setLoading(true);
        const res = await getMembers();
        if (res.success) {
            setMembers(res.profiles || []);
            setInvites(res.invites || []);
        }
        setLoading(false);
    }

    async function handleInvite(e: React.FormEvent) {
        e.preventDefault();
        if (!inviteEmail) return;

        setInviteLoading(true);
        const formData = new FormData();
        formData.append('email', inviteEmail);
        const res = await inviteMember(formData);
        setInviteLoading(false);

        if (res.success) {
            setInviteEmail("");
            setIsInviteModalOpen(false);
            fetchData();
            toast.success("Convite enviado com sucesso!");
        } else {
            toast.error("Erro ao enviar convite", res.error);
        }
    }

    async function handleRevoke(inviteId: string) {
        const ok = await confirm({
            title: "Cancelar convite?",
            description: "O convidado nao podera mais usar este link.",
            tone: "warning",
            confirmText: "Cancelar convite",
        });
        if (!ok) return;

        const res = await revokeInvite(inviteId);
        if (res.success) {
            fetchData();
        } else {
            toast.error("Erro ao cancelar convite", res.error);
        }
    }

    async function handleRemoveMember(userId: string) {
        const ok = await confirm({
            title: "Remover membro?",
            description: "Essa acao removera o acesso deste usuario permanentemente.",
            tone: "warning",
            confirmText: "Remover",
        });
        if (!ok) return;

        const res = await removeMember(userId);
        if (res.success) {
            fetchData();
        } else {
            toast.error("Erro ao remover membro", res.error);
        }
    }

    async function handleRoleUpdate(userId: string, newRole: 'admin' | 'vendedor') {
        const res = await updateMemberRole(userId, newRole);
        if (res.success) {
            fetchData();
        } else {
            toast.error("Erro ao atualizar funcao", res.error);
        }
    }

    return (
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            <PageHeader
                title="Minha Equipe"
                description="Gerencie os membros do seu time e convites."
                icon={<Users className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Minha Equipe" },
                ]}
                actions={
                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus size={20} />
                        Convidar Vendedor
                    </button>
                }
            />

            {/* Lista de Membros */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-8 shadow-sm">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <h2 className="font-semibold flex items-center gap-2 text-slate-800">
                        <User size={18} className="text-blue-600" />
                        Membros Ativos
                    </h2>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : members.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">Nenhum membro encontrado.</div>
                ) : (
                    <div className="divide-y divide-slate-200">
                        {members.map((member) => (
                            <div key={member.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-lg font-bold text-slate-500 border border-slate-200">
                                        {member.full_name?.[0]?.toUpperCase() || <User size={20} />}
                                    </div>
                                    <div>
                                        <div className="font-medium flex items-center gap-2 text-slate-900">
                                            {member.full_name || "Usuário sem nome"}
                                            {currentUser?.id === member.id && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                    Você
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-slate-500">{member.email}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <select
                                        aria-label={`Função de ${member.full_name || member.email}`}
                                        className="text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                                        value={member.role || 'vendedor'}
                                        onChange={(e) => handleRoleUpdate(member.id, e.target.value as 'admin' | 'vendedor')}
                                        disabled={currentUser?.id === member.id}
                                    >
                                        <option value="vendedor">Vendedor</option>
                                        <option value="admin">Admin</option>
                                    </select>

                                    {currentUser?.id !== member.id && (
                                        <button
                                            onClick={() => handleRemoveMember(member.id)}
                                            className="text-slate-500 hover:text-rose-600 transition-colors p-2.5"
                                            aria-label={`Remover ${member.full_name || member.email}`}
                                            title="Remover membro"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lista de Convites */}
            {invites.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-200 bg-slate-50">
                        <h2 className="font-semibold flex items-center gap-2 text-slate-800">
                            <Mail size={18} className="text-amber-600" />
                            Convites Pendentes
                        </h2>
                    </div>
                    <div className="divide-y divide-slate-200">
                        {invites.map((invite) => (
                            <div key={invite.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-700 border border-amber-100">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-900">{invite.email}</div>
                                        <div className="text-sm text-slate-500">Convidado em {new Date(invite.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                                        Pendente
                                    </div>
                                    <button
                                        onClick={() => handleRevoke(invite.id)}
                                        className="text-slate-500 hover:text-rose-600 transition-colors p-2.5"
                                        aria-label={`Cancelar convite de ${invite.email}`}
                                        title="Cancelar convite"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal de Convite */}
            {
                isInviteModalOpen && (
                    <div
                        className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setIsInviteModalOpen(false)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Convidar membro"
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white p-6 rounded-xl w-full max-w-md border border-slate-200 shadow-2xl"
                        >
                            <h2 className="text-xl font-bold mb-4 text-slate-800">Convidar Membro</h2>
                            <form onSubmit={handleInvite}>
                                <div className="mb-4">
                                    <label htmlFor="invite-email" className="block text-sm text-slate-700 mb-1">E-mail do Vendedor</label>
                                    <input
                                        id="invite-email"
                                        type="email"
                                        autoFocus
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        placeholder="exemplo@email.com"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsInviteModalOpen(false)}
                                        className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={inviteLoading}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {inviteLoading ? "Enviando..." : "Enviar Convite"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
