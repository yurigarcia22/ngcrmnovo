"use client";

import { useState, useEffect } from "react";
import { getMembers, inviteMember, revokeInvite, removeMember, updateMemberRole } from "./actions";
import { User, Plus, Mail, Shield, Clock, CheckCircle, Trash2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function TeamPage() {
    const [members, setMembers] = useState<any[]>([]);
    const [invites, setInvites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteLoading, setInviteLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchData();
        getCurrentUser();
    }, []);

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
            alert("Convite enviado com sucesso!");
        } else {
            alert("Erro ao enviar convite: " + res.error);
        }
    }

    async function handleRevoke(inviteId: string) {
        if (!confirm("Tem certeza que deseja cancelar este convite?")) return;

        const res = await revokeInvite(inviteId);
        if (res.success) {
            fetchData();
        } else {
            alert("Erro ao cancelar convite: " + res.error);
        }
    }

    async function handleRemoveMember(userId: string) {
        if (!confirm("TEM CERTEZA? Essa ação removerá o acesso deste usuário permanentemente.")) return;

        const res = await removeMember(userId);
        if (res.success) {
            fetchData();
        } else {
            alert("Erro ao remover membro: " + res.error);
        }
    }

    async function handleRoleUpdate(userId: string, newRole: 'admin' | 'vendedor') {
        const res = await updateMemberRole(userId, newRole);
        if (res.success) {
            fetchData();
        } else {
            alert("Erro ao atualizar função: " + res.error);
        }
    }

    return (
        <div className="flex-1 text-gray-800">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 text-gray-800">Minha Equipe</h1>
                        <p className="text-gray-500">Gerencie os membros do seu time e convites.</p>
                    </div>
                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus size={20} />
                        Convidar Vendedor
                    </button>
                </div>

                {/* Lista de Membros */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8 shadow-sm">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h2 className="font-semibold flex items-center gap-2">
                            <User size={18} className="text-blue-400" />
                            Membros Ativos
                        </h2>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Carregando...</div>
                    ) : members.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Nenhum membro encontrado.</div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {members.map((member) => (
                                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-lg font-bold text-gray-500 border border-gray-200">
                                            {member.full_name?.[0]?.toUpperCase() || <User size={20} />}
                                        </div>
                                        <div>
                                            <div className="font-medium flex items-center gap-2 text-gray-900">
                                                {member.full_name || "Usuário sem nome"}
                                                {currentUser?.id === member.id && (
                                                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                                                        Você
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-500">{member.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <select
                                            className="text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-100"
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
                                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
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
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <h2 className="font-semibold flex items-center gap-2 text-gray-800">
                                <Mail size={18} className="text-yellow-500" />
                                Convites Pendentes
                            </h2>
                        </div>
                        <div className="divide-y divide-gray-200">
                            {invites.map((invite) => (
                                <div key={invite.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-600 border border-yellow-100">
                                            <Clock size={20} />
                                        </div>
                                        <div>
                                            <div className="font-medium text-gray-900">{invite.email}</div>
                                            <div className="text-sm text-gray-500">Convidado em {new Date(invite.created_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 text-sm text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full">
                                            Pendente
                                        </div>
                                        <button
                                            onClick={() => handleRevoke(invite.id)}
                                            className="text-gray-500 hover:text-red-400 transition-colors p-2"
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
            </div>

            {/* Modal de Convite */}
            {
                isInviteModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-xl w-full max-w-md border border-gray-200 shadow-2xl">
                            <h2 className="text-xl font-bold mb-4 text-gray-800">Convidar Membro</h2>
                            <form onSubmit={handleInvite}>
                                <div className="mb-4">
                                    <label className="block text-sm text-gray-600 mb-1">E-mail do Vendedor</label>
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        placeholder="exemplo@email.com"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsInviteModalOpen(false)}
                                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
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
