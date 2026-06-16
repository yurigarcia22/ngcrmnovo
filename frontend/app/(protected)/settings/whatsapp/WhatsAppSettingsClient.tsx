"use client";

import { useState, useEffect } from "react";
import { setupInstance, deleteInstance, refreshInstanceStatus, setInstancePurpose, connectInstance } from "./actions";
import { Loader2, Smartphone, Plus, Trash2, RefreshCw, X, QrCode as QrIcon, Briefcase, Megaphone, Boxes, KeyRound, Copy, Check, ArrowLeft, Plug } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";

interface Instance {
    id: string;
    instance_name: string;
    custom_name?: string;
    status: string;
    owner_profile_id?: string;
    phone_number?: string;
    profile_pic_url?: string;
    purpose?: "crm" | "webinar" | "both";
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

interface Connection {
    instanceName: string;
    qrCode?: string;
    pairingCode?: string;
}

export default function WhatsAppSettingsClient({
    initialInstances,
    teamMembers
}: WhatsAppSettingsClientProps) {
    const [instances, setInstances] = useState<Instance[]>(initialInstances);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const confirm = useConfirm();

    // Modal de Adicionar
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newConnectionName, setNewConnectionName] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState("");

    // Modal de Conexao (QR + Codigo)
    const [connection, setConnection] = useState<Connection | null>(null);
    const [connView, setConnView] = useState<"qr" | "code">("qr");
    const [connPhone, setConnPhone] = useState("");
    const [connLoading, setConnLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // --- REAL-TIME STATUS CHECK ---
    useEffect(() => {
        const checkStatuses = async () => {
            const updatedInstances = await Promise.all(instances.map(async (inst) => {
                const res = await refreshInstanceStatus(inst.instance_name);
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

            const hasChanged = JSON.stringify(updatedInstances) !== JSON.stringify(instances);
            if (hasChanged) {
                setInstances(updatedInstances);
            }
        };

        if (instances.length > 0) {
            checkStatuses();
        }
    }, []); // Run once on mount

    // --- POLLING enquanto o modal de conexao esta aberto ---
    useEffect(() => {
        if (!connection) return;
        const target = connection.instanceName;
        const id = setInterval(async () => {
            const res = await refreshInstanceStatus(target);
            if (res.success && res.status === "connected") {
                clearInterval(id);
                toast.success("WhatsApp conectado com sucesso!");
                window.location.reload();
            }
        }, 3000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connection?.instanceName]);

    // Helper para formatar telefone
    const formatPhone = (phone: string | undefined) => {
        if (!phone) return "";
        if (phone.length === 12 || phone.length === 13) {
            return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 8)}-${phone.slice(8)}`;
        }
        return `+${phone}`;
    }

    // Formata o codigo de pareamento (8 chars -> XXXX-XXXX)
    const formatPairing = (code: string) =>
        code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

    async function handleSubmitNew(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            // Cria a instancia e ja gera o QR Code (metodo padrao).
            const result = await setupInstance(newConnectionName, selectedMemberId || undefined);
            if (result.success && (result.qrCode || result.pairingCode)) {
                setConnection({
                    instanceName: result.instanceName || "",
                    qrCode: result.qrCode,
                    pairingCode: result.pairingCode,
                });
                setConnView("qr");
                setConnPhone("");
                setIsAddModalOpen(false);
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

    // Abre o modal de conexao para uma instancia ja existente (reconectar).
    async function handleReconnect(instance: Instance) {
        setConnection({ instanceName: instance.instance_name });
        setConnView("qr");
        setConnPhone(instance.phone_number || "");
        setConnLoading(true);
        try {
            const res = await connectInstance(instance.instance_name, { method: "qr" });
            if (res.success && res.qrCode) {
                setConnection({ instanceName: instance.instance_name, qrCode: res.qrCode });
            } else if (res.success && res.status === "connected") {
                toast.success("Esta conexão já está ativa!");
                window.location.reload();
            } else {
                toast.error(res.error || "Erro ao gerar QR Code.");
            }
        } catch {
            toast.error("Erro ao conectar.");
        } finally {
            setConnLoading(false);
        }
    }

    // Gera o codigo de pareamento (8 digitos) para o numero informado.
    async function handleGenerateCode() {
        if (!connection) return;
        const digits = connPhone.replace(/\D/g, "");
        if (digits.length < 12 || digits.length > 13) {
            toast.error("Digite o número completo com DDI e DDD. Ex: 5531999999999");
            return;
        }
        setConnLoading(true);
        try {
            const res = await connectInstance(connection.instanceName, {
                method: "code",
                phoneNumber: digits,
            });
            if (res.success && res.pairingCode) {
                setConnection({ ...connection, pairingCode: res.pairingCode });
            } else if (res.success && res.status === "connected") {
                toast.success("Conectado com sucesso!");
                window.location.reload();
            } else {
                toast.error(res.error || "Erro ao gerar o código.");
            }
        } catch {
            toast.error("Erro ao gerar o código.");
        } finally {
            setConnLoading(false);
        }
    }

    function copyCode() {
        if (!connection?.pairingCode) return;
        navigator.clipboard.writeText(connection.pairingCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    function closeConnection() {
        setConnection(null);
        setConnView("qr");
        setConnPhone("");
        setCopied(false);
    }

    async function handleDelete(instanceName: string) {
        const ok = await confirm({
            title: "Remover conexao?",
            description: "Essa acao desconectara este numero do WhatsApp.",
            tone: "danger",
            confirmText: "Remover",
        });
        if (!ok) return;
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

                        {/* Purpose selector — define onde esta instancia atua */}
                        <div className="mb-3">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                Uso desta conexão
                            </label>
                            <div className="grid grid-cols-3 gap-1">
                                {([
                                    { key: "crm" as const, label: "CRM", icon: Briefcase },
                                    { key: "webinar" as const, label: "Webinar", icon: Megaphone },
                                    { key: "both" as const, label: "Ambos", icon: Boxes },
                                ]).map(({ key, label, icon: Icon }) => {
                                    const active = (instance.purpose ?? "crm") === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={async () => {
                                                const res = await setInstancePurpose(instance.instance_name, key);
                                                if (res.success) {
                                                    setInstances((prev) =>
                                                        prev.map((i) =>
                                                            i.instance_name === instance.instance_name
                                                                ? { ...i, purpose: key }
                                                                : i,
                                                        ),
                                                    );
                                                    toast.success(`Marcada como ${label}`);
                                                } else {
                                                    toast.error(res.error ?? "Erro");
                                                }
                                            }}
                                            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                                                active
                                                    ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                                                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                                            }`}
                                        >
                                            <Icon className="w-3 h-3" />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {instance.status !== 'connected' && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleReconnect(instance)}
                                    className="flex-1 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Plug size={14} />
                                    Conectar
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="py-2 px-3 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center justify-center gap-2"
                                    title="Atualizar status"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
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
                                Conectar WhatsApp
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Conexão (QR Code + Código) */}
            {connection && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-sm p-7 text-center shadow-2xl relative">
                        <button
                            onClick={closeConnection}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X size={22} />
                        </button>

                        {/* ===== VIEW: QR CODE ===== */}
                        {connView === "qr" && (
                            <>
                                <h2 className="text-xl font-bold text-gray-800 mb-2">Escaneie o QR Code</h2>
                                <p className="text-gray-500 mb-5 text-sm">
                                    Abra o WhatsApp no celular → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.
                                </p>

                                <div className="bg-white p-2 border rounded-lg inline-block mb-5 min-h-[272px] min-w-[272px] flex items-center justify-center">
                                    {connection.qrCode ? (
                                        <img src={connection.qrCode} alt="QR Code" className="w-64 h-64 object-contain" />
                                    ) : (
                                        <Loader2 className="animate-spin text-gray-400" size={40} />
                                    )}
                                </div>

                                {/* Opção embaixo: conectar via código */}
                                <button
                                    onClick={() => setConnView("code")}
                                    className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-lg font-medium flex items-center justify-center gap-2 mb-3"
                                >
                                    <KeyRound size={18} />
                                    Não consigo ler o QR — conectar via código
                                </button>

                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
                                >
                                    Concluído
                                </button>
                            </>
                        )}

                        {/* ===== VIEW: CÓDIGO ===== */}
                        {connView === "code" && (
                            <>
                                <h2 className="text-xl font-bold text-gray-800 mb-2">Conectar via código</h2>

                                {!connection.pairingCode ? (
                                    <>
                                        <p className="text-gray-500 mb-5 text-sm">
                                            Digite o número do WhatsApp que você vai conectar (com DDI e DDD).
                                        </p>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            placeholder="Ex: 5531999999999"
                                            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-lg font-mono tracking-wide focus:ring-2 focus:ring-green-500 focus:outline-none mb-2"
                                            value={connPhone}
                                            onChange={e => setConnPhone(e.target.value)}
                                        />
                                        <p className="text-xs text-gray-400 mb-5">
                                            DDI (55) + DDD + número. Sem espaços ou símbolos.
                                        </p>
                                        <button
                                            onClick={handleGenerateCode}
                                            disabled={connLoading}
                                            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-70 mb-3"
                                        >
                                            {connLoading ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
                                            Gerar código
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-gray-500 mb-5 text-sm">
                                            No WhatsApp do celular: <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> →
                                            {" "}<b>Conectar com número de telefone</b> e digite o código abaixo.
                                        </p>

                                        <button
                                            onClick={copyCode}
                                            title="Clique para copiar"
                                            className="w-full bg-gray-900 hover:bg-black text-white rounded-xl py-5 mb-2 flex items-center justify-center gap-3 transition-colors"
                                        >
                                            <span className="text-3xl font-mono font-bold tracking-[0.3em]">
                                                {formatPairing(connection.pairingCode)}
                                            </span>
                                            {copied ? <Check size={20} className="text-green-400" /> : <Copy size={18} className="opacity-70" />}
                                        </button>
                                        <p className="text-xs text-gray-400 mb-5">
                                            O código expira em alguns minutos. Se não funcionar, gere um novo.
                                        </p>

                                        <button
                                            onClick={() => setConnection({ ...connection, pairingCode: undefined })}
                                            className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 py-2.5 rounded-lg font-medium mb-3"
                                        >
                                            Gerar novo código
                                        </button>
                                    </>
                                )}

                                {/* Voltar para o QR */}
                                <button
                                    onClick={() => setConnView("qr")}
                                    className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm font-medium flex items-center justify-center gap-1"
                                >
                                    <ArrowLeft size={14} />
                                    Voltar para o QR Code
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
