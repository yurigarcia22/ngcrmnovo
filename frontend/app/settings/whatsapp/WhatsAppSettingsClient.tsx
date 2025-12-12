"use client";

import { useState, useEffect } from "react";
import { setupInstance, deleteInstance, refreshInstanceStatus } from "./actions";
import { Loader2, Smartphone, Plus, Trash2, User, RefreshCw, X, QrCode as QrIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Instance {
    id: string;
    instance_name: string;
    custom_name?: string;
    status: string;
    owner_profile_id?: string;
    phone_number?: string;
    profile_pic_url?: string;
    owner?: {
        full_name: string;
        avatar_url: string;
    }
}

interface TeamMember {
    id: string;
    full_name: string;
    avatar_url: string;
}

interface WhatsAppSettingsClientProps {
    initialInstances: Instance[];
    teamMembers: TeamMember[];
}

export default function WhatsAppSettingsClient({
    initialInstances,
    teamMembers
}: WhatsAppSettingsClientProps) {
    const [instances, setInstances] = useState<Instance[]>(initialInstances);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Modal de Adicionar
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newConnectionName, setNewConnectionName] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState("");

    // Modal de QR Code
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [qrInstanceName, setQrInstanceName] = useState<string | null>(null);

    // --- REAL-TIME STATUS CHECK (NEW) ---
    useEffect(() => {
        const checkStatuses = async () => {
            // Itera sobre as instâncias para verificar status real
            const updatedInstances = await Promise.all(instances.map(async (inst) => {
                const res = await refreshInstanceStatus(inst.instance_name);
                // Se mudou status ou trouxemos dados novos (fone/foto)
                if (res.success && (res.status !== inst.status || res.phoneNumber !== inst.phone_number || res.profilePicUrl !== inst.profile_pic_url)) {
                    return {
                        ...inst,
                        status: res.status,
                        phone_number: res.phoneNumber || inst.phone_number,
                        profile_pic_url: res.profilePicUrl || inst.profile_pic_url
                    };
                }
                return inst;
            }));

            // Verifica se houve mudança para evitar re-render desnecessário
            const hasChanged = JSON.stringify(updatedInstances) !== JSON.stringify(instances);
            if (hasChanged) {
                setInstances(updatedInstances);
            }
        };

        if (instances.length > 0) {
            checkStatuses();
        }
    }, []); // Run once on mount

    // Helper para formatar telefone
    const formatPhone = (phone: string | undefined) => {
        if (!phone) return "";
        // +55 31 9999-9999
        if (phone.length === 12 || phone.length === 13) {
            return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 8)}-${phone.slice(8)}`;
        }
        return `+${phone}`;
    }

    async function handleSubmitNew(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await setupInstance(newConnectionName, selectedMemberId || undefined);
            if (result.success && result.qrCode) {
                setQrCodeData(result.qrCode);
                setQrInstanceName(result.instanceName || null);
                setIsAddModalOpen(false); // Fecha formulário
            } else if (result.success && result.status === 'connected') {
                toast.success("Conectado com sucesso!");
                window.location.reload();
            } else {
                toast.error("Erro: " + result.error);
            }
        } catch (error) {
            toast.error("Erro ao criar instância.");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(instanceName: string) {
        if (!confirm("Tem certeza que deseja remover esta conexão?")) return;
        setLoading(true);
        try {
            await deleteInstance(instanceName);
            setInstances(prev => prev.filter(i => i.instance_name !== instanceName));
            toast.success("Conexão removida.");
        } catch (error) {
            toast.error("Erro ao deletar.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Smartphone className="text-green-600" />
                        Conexões WhatsApp
                    </h1>
                    <p className="text-gray-500">Gerencie múltiplos números de WhatsApp para sua equipe.</p>
                </div>
                <button
                    onClick={() => {
                        setNewConnectionName("");
                        setSelectedMemberId("");
                        setIsAddModalOpen(true);
                    }}
                    className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                    <Plus size={18} />
                    Nova Conexão
                </button>
            </div>

            {/* Empty State */}
            {instances.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                    <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Smartphone className="text-gray-400" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-gray-700">Nenhuma conexão ativa</h3>
                    <p className="text-gray-500 mb-6">Adicione um número de WhatsApp para começar.</p>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="text-blue-600 font-medium hover:underline"
                    >
                        Adicionar agora
                    </button>
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {instances.map((instance) => (
                    <div key={instance.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative">
                        <div className="flex justify-between items-start mb-4">
                            <div className="overflow-hidden">
                                <h3 className="font-semibold text-gray-800 truncate pr-2" title={instance.custom_name || instance.instance_name}>
                                    {instance.custom_name || instance.instance_name}
                                </h3>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className={`w-2 h-2 rounded-full ${instance.status === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span className="text-xs text-gray-500 capitalize">{instance.status === 'connected' ? 'Conectado' : 'Aguardando / Desconectado'}</span>
                                    {instance.phone_number && (
                                        <span className="text-xs font-mono text-gray-600 ml-1">
                                            {formatPhone(instance.phone_number)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(instance.instance_name)}
                                className="text-gray-400 hover:text-red-500 p-1"
                                title="Remover conexão"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center gap-3">
                            <div className="w-10 h-10 min-w-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border border-gray-300">
                                {instance.profile_pic_url ? (
                                    <img src={instance.profile_pic_url} alt="WhatsApp Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    instance.owner?.avatar_url ? (
                                        <img src={instance.owner.avatar_url} alt={instance.owner.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Smartphone size={18} className="text-gray-500" />
                                    )
                                )}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs text-gray-400 uppercase tracking-wider">Responsável</p>
                                <p className="text-sm font-medium text-gray-700 truncate">
                                    {instance.owner?.full_name || "Geral da Empresa"}
                                </p>
                            </div>
                        </div>

                        {instance.status !== 'connected' && (
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={14} />
                                Atualizar Status
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Modal Nova Conexão */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800">Nova Conexão</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitNew}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Conexão</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="Ex: Comercial Principal"
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-black focus:outline-none"
                                    value={newConnectionName}
                                    onChange={e => setNewConnectionName(e.target.value)}
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Responsável pelo Atendimento</label>
                                <select
                                    required
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-black focus:outline-none bg-white"
                                    value={selectedMemberId}
                                    onChange={e => setSelectedMemberId(e.target.value)}
                                >
                                    <option value="" disabled>Selecione um responsável...</option>
                                    {teamMembers.length > 0 ? (
                                        teamMembers.map(member => (
                                            <option key={member.id} value={member.id}>{member.full_name}</option>
                                        ))
                                    ) : (
                                        <option value="" disabled>Nenhum membro encontrado</option>
                                    )}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    Obrigatório: Os leads deste WhatsApp serão atribuídos a este vendedor.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <QrIcon size={20} />}
                                Gerar QR Code
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal QR Code */}
            {qrCodeData && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-sm p-8 text-center shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Escaneie o QR Code</h2>
                        <p className="text-gray-500 mb-6 text-sm">Abra o WhatsApp no seu celular → Configurações → Aparelhos conectados → Conectar aparelho.</p>

                        <div className="bg-white p-2 border rounded-lg inline-block mb-6">
                            <img src={qrCodeData} alt="QR Code" className="w-64 h-64 object-contain" />
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
                        >
                            Concluído
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
