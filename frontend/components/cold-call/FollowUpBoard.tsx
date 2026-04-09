import {
    Phone,
    MessageSquare,
    CheckCircle2,
    AlertCircle,
    Clock,
    Sun,
    Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FollowUpRowProps {
    followup: any;
    onActionClick: (followupId: string, actionType: string) => void;
    onRowClick?: (followup: any) => void;
}

// ---------- helpers ----------

function formatPhone(phone: string): string {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return phone;
}

function getInitials(name: string): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    urgente: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Urgente" },
    alta: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", label: "Alta" },
    media: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Media" },
    baixa: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: "Baixa" },
};

const ACTION_LABELS: Record<string, string> = {
    ligacao: "Ligacao",
    whatsapp: "WhatsApp",
    email: "Email",
    retorno_prometido: "Retorno",
    nova_tentativa: "Nova tentativa",
};

// ---------- FollowUpCard ----------

export function FollowUpRow({ followup, onActionClick, onRowClick }: FollowUpRowProps) {
    const isAtrasado = followup.status === "atrasado";

    const leadName: string = followup.cold_leads?.nome || "Lead sem nome";
    const leadCompany: string = followup.cold_leads?.nicho || "";
    const leadPhone: string = formatPhone(followup.cold_leads?.telefone || "");
    const initials = getInitials(leadName);

    const priority = PRIORITY_STYLES[followup.prioridade] || PRIORITY_STYLES.media;
    const actionLabel =
        ACTION_LABELS[followup.tipo_acao] || String(followup.tipo_acao || "").replace(/_/g, " ");

    const horario = followup.horario_especifico
        ? followup.horario_especifico.substring(0, 5)
        : null;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onRowClick?.(followup)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick?.(followup);
                }
            }}
            className={cn(
                "group relative w-full p-3 mb-2 rounded-xl border transition-all cursor-pointer",
                "hover:shadow-md hover:-translate-y-0.5",
                isAtrasado
                    ? "bg-red-50/40 border-red-200 hover:border-red-300"
                    : "bg-white border-slate-200 hover:border-indigo-300"
            )}
        >
            {/* Faixa lateral de urgencia */}
            <div
                aria-hidden="true"
                className={cn(
                    "absolute left-0 top-3 bottom-3 w-1 rounded-r-full",
                    isAtrasado ? "bg-red-500" : "bg-indigo-500"
                )}
            />

            {/* Header: Avatar + Nome + Badge prioridade */}
            <div className="flex items-start gap-2.5 pl-2 min-w-0">
                {/* Avatar com iniciais */}
                <div
                    className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border",
                        isAtrasado
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-indigo-50 text-indigo-700 border-indigo-100"
                    )}
                    title={leadName}
                >
                    {initials}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Linha 1: Nome + Badge prioridade */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <h4
                            className="font-semibold text-sm text-slate-900 truncate leading-tight"
                            title={leadName}
                        >
                            {leadName}
                        </h4>
                        <span
                            className={cn(
                                "shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                                priority.bg,
                                priority.text
                            )}
                        >
                            <span className={cn("w-1.5 h-1.5 rounded-full", priority.dot)} />
                            {priority.label}
                        </span>
                    </div>

                    {/* Linha 2: Nicho */}
                    {leadCompany && (
                        <p
                            className="text-[11px] text-slate-500 truncate mt-0.5"
                            title={leadCompany}
                        >
                            {leadCompany}
                        </p>
                    )}

                    {/* Linha 3: Telefone */}
                    {leadPhone && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{leadPhone}</span>
                        </div>
                    )}

                    {/* Linha 4: Metadata (horario + acao) */}
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            {horario ?? "Qualquer"}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="truncate italic" title={actionLabel}>
                            {actionLabel}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions: visiveis sempre no mobile, no hover no desktop */}
            <div
                className={cn(
                    "flex items-center gap-1 mt-2.5 pt-2.5 border-t border-slate-100",
                    "opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={() => onActionClick(followup.id, "call")}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                    title="Realizar ligacao"
                >
                    <Phone className="w-3 h-3" />
                    Ligar
                </button>
                <button
                    type="button"
                    onClick={() => onActionClick(followup.id, "whatsapp")}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                    title="Enviar WhatsApp"
                >
                    <MessageSquare className="w-3 h-3" />
                    Zap
                </button>
                <button
                    type="button"
                    onClick={() => onActionClick(followup.id, "complete")}
                    className="inline-flex items-center justify-center py-1.5 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                    title="Concluir follow-up"
                >
                    <CheckCircle2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// -------------------------------------------------------------
// MAIN BOARD COMPONENT
// -------------------------------------------------------------

type ColumnKind = "atrasados" | "manha" | "tarde";

function BoardColumn({
    kind,
    title,
    subtitle,
    items,
    onActionClick,
    onRowClick,
    emptyLabel,
}: {
    kind: ColumnKind;
    title: string;
    subtitle: string;
    items: any[];
    onActionClick: (id: string, action: string) => void;
    onRowClick?: (followup: any) => void;
    emptyLabel: string;
}) {
    const headerStyles = {
        atrasados: { iconBg: "bg-red-100", iconColor: "text-red-600", Icon: AlertCircle },
        manha: { iconBg: "bg-amber-100", iconColor: "text-amber-600", Icon: Sun },
        tarde: { iconBg: "bg-indigo-100", iconColor: "text-indigo-600", Icon: Moon },
    }[kind];

    const Icon = headerStyles.Icon;

    return (
        <div className="flex flex-col bg-white rounded-xl p-4 border border-slate-200 shadow-sm h-full max-h-[70vh] min-w-0">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 shrink-0">
                <div
                    className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center",
                        headerStyles.iconBg
                    )}
                >
                    <Icon className={cn("w-4 h-4", headerStyles.iconColor)} />
                </div>
                <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm truncate">{title}</h3>
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                        {items.length} {subtitle}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
                {items.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                        <CheckCircle2 className="w-6 h-6 mb-2 text-slate-300" />
                        <span className="text-xs font-medium text-slate-500">{emptyLabel}</span>
                    </div>
                ) : (
                    items.map((f) => (
                        <FollowUpRow
                            key={f.id}
                            followup={f}
                            onActionClick={onActionClick}
                            onRowClick={onRowClick}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

export function FollowUpBoard({
    followups,
    onActionClick,
    onRowClick,
}: {
    followups: any[];
    onActionClick: (id: string, action: string) => void;
    onRowClick?: (followup: any) => void;
}) {
    const atrasados = followups.filter((f) => f.status === "atrasado");
    const manha = followups.filter(
        (f) => f.status !== "atrasado" && f.periodo === "manha"
    );
    const tarde = followups.filter(
        (f) =>
            f.status !== "atrasado" &&
            (f.periodo === "tarde" || f.periodo === "noite" || f.periodo === "qualquer")
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 h-full p-2 place-content-start">
            <BoardColumn
                kind="atrasados"
                title="Atrasados"
                subtitle="pendencias para agir agora"
                items={atrasados}
                onActionClick={onActionClick}
                onRowClick={onRowClick}
                emptyLabel="Nenhum atraso"
            />

            <BoardColumn
                kind="manha"
                title="Manha (08h - 12h)"
                subtitle="contatos programados"
                items={manha}
                onActionClick={onActionClick}
                onRowClick={onRowClick}
                emptyLabel="Nada para a manha"
            />

            <BoardColumn
                kind="tarde"
                title="Tarde (13h - 18h+)"
                subtitle="contatos programados"
                items={tarde}
                onActionClick={onActionClick}
                onRowClick={onRowClick}
                emptyLabel="Nada para a tarde"
            />
        </div>
    );
}
