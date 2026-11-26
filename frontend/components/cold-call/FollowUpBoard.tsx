import {
    Phone,
    MessageSquare,
    MessageCircle,
    Mail,
    RotateCcw,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Clock,
    Sun,
    Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhoneBR, todayBR } from "@/lib/br-time";

// ---------- helpers compartilhados (quadro do dia e agenda) ----------

export function getInitials(name: string): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Nome que vem do Google Meu Negocio costuma ter " | descricao": mostra so o nome.
export function shortLeadName(name: string): string {
    const n = String(name || "").trim();
    if (!n) return "Lead sem nome";
    return n.split(/\s+\|\s+/)[0] || n;
}

export const PRIORITY_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    urgente: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Urgente" },
    alta: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", label: "Alta" },
    media: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Média" },
    baixa: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: "Baixa" },
};

export const ACTION_META: Record<string, { label: string; Icon: any; chip: string; bar: string }> = {
    ligacao: { label: "Ligação", Icon: Phone, chip: "bg-indigo-50 text-indigo-700 border-indigo-200", bar: "bg-indigo-500" },
    whatsapp: { label: "WhatsApp", Icon: MessageCircle, chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" },
    email: { label: "E-mail", Icon: Mail, chip: "bg-sky-50 text-sky-700 border-sky-200", bar: "bg-sky-500" },
    retorno_prometido: { label: "Retorno", Icon: RotateCcw, chip: "bg-violet-50 text-violet-700 border-violet-200", bar: "bg-violet-500" },
    nova_tentativa: { label: "Nova tentativa", Icon: RefreshCw, chip: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500" },
};

export function actionMeta(tipo: string) {
    return ACTION_META[tipo] ?? {
        label: String(tipo || "Contato").replace(/_/g, " "),
        Icon: Phone,
        chip: "bg-slate-50 text-slate-700 border-slate-200",
        bar: "bg-slate-400",
    };
}

export const PERIOD_LABEL: Record<string, string> = {
    manha: "Manhã",
    tarde: "Tarde",
    noite: "Noite",
    qualquer: "Qualquer horário",
};

// Hora marcada (10:00) ou o periodo (Manha, Tarde...).
export function followupWhen(f: any): string {
    if (f?.horario_especifico) return String(f.horario_especifico).substring(0, 5);
    return PERIOD_LABEL[f?.periodo] ?? "Qualquer horário";
}

// Ordem dentro do dia: manha, tarde, noite, qualquer; com hora marcada pela hora.
export function followupSortKey(f: any): string {
    const p = { manha: "1", tarde: "2", noite: "3", qualquer: "4" }[f?.periodo as string] ?? "5";
    const h = f?.horario_especifico ? String(f.horario_especifico).substring(0, 5) : "99:99";
    return `${p}${h}`;
}

function shortDate(ymd: string) {
    const [, m, d] = String(ymd || "").slice(0, 10).split("-");
    return d && m ? `${d}/${m}` : "";
}

// ---------- FollowUpCard ----------

interface FollowUpRowProps {
    followup: any;
    onActionClick: (followupId: string, actionType: string) => void;
    onRowClick?: (followup: any) => void;
}

export function FollowUpRow({ followup, onActionClick, onRowClick }: FollowUpRowProps) {
    const isAtrasado = followup.status === "atrasado";
    const isDone = followup.status === "concluido";

    const fullName: string = followup.cold_leads?.nome || "Lead sem nome";
    const leadName = shortLeadName(fullName);
    const leadNicho: string = followup.cold_leads?.nicho || "";
    const leadPhone: string = formatPhoneBR(followup.cold_leads?.telefone || "");
    const initials = getInitials(leadName);

    const priority = PRIORITY_STYLES[followup.prioridade] || PRIORITY_STYLES.media;
    const action = actionMeta(followup.tipo_acao);
    const ActionIcon = action.Icon;
    const when = followupWhen(followup);
    const dateYmd = String(followup.data_agendada || "").slice(0, 10);
    const daysLate = isAtrasado && dateYmd
        ? Math.round((Date.parse(todayBR()) - Date.parse(dateYmd)) / 86400000)
        : 0;

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
                isDone
                    ? "bg-slate-50 border-slate-200 opacity-70"
                    : isAtrasado
                        ? "bg-red-50/40 border-red-200 hover:border-red-300"
                        : "bg-white border-slate-200 hover:border-indigo-300"
            )}
        >
            {/* Faixa lateral: vermelha se atrasado, senao a cor do tipo de acao */}
            <div
                aria-hidden="true"
                className={cn(
                    "absolute left-0 top-3 bottom-3 w-1 rounded-r-full",
                    isAtrasado ? "bg-red-500" : isDone ? "bg-slate-300" : action.bar
                )}
            />

            <div className="flex items-start gap-2.5 pl-2 min-w-0">
                <div
                    className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border",
                        isAtrasado
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-indigo-50 text-indigo-700 border-indigo-100"
                    )}
                    title={fullName}
                >
                    {initials}
                </div>

                <div className="flex-1 min-w-0">
                    {/* Nome + prioridade */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                        <h4
                            className={cn("font-semibold text-sm text-slate-900 leading-snug line-clamp-2 break-words", isDone && "line-through text-slate-500")}
                            title={fullName}
                        >
                            {leadName}
                        </h4>
                        {isDone ? (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" /> Feito
                            </span>
                        ) : (
                            <span className={cn("shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold", priority.bg, priority.text)}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", priority.dot)} />
                                {priority.label}
                            </span>
                        )}
                    </div>

                    {/* Nicho / atraso */}
                    {(leadNicho || isAtrasado) && (
                        <p className="text-[11px] mt-0.5 truncate">
                            {leadNicho && <span className="text-slate-500">{leadNicho}</span>}
                            {leadNicho && isAtrasado && <span className="text-slate-300"> · </span>}
                            {isAtrasado && (
                                <span className="text-red-600 font-semibold">
                                    Era pra {shortDate(dateYmd)}{daysLate > 0 ? ` (${daysLate} ${daysLate === 1 ? "dia" : "dias"} atrás)` : ""}
                                </span>
                            )}
                        </p>
                    )}

                    {/* Telefone */}
                    {leadPhone && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="tabular-nums">{leadPhone}</span>
                        </div>
                    )}

                    {/* Quando + tipo de acao */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {when}
                        </span>
                        <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold", action.chip)}>
                            <ActionIcon className="w-3 h-3" />
                            {action.label}
                        </span>
                    </div>

                    {followup.objetivo && (
                        <p className="mt-1.5 text-[11.5px] text-slate-600 line-clamp-2" title={followup.objetivo}>
                            {followup.objetivo}
                        </p>
                    )}
                </div>
            </div>

            {/* Acoes (sempre visiveis; antes sumiam no computador e deixavam um buraco no cartao) */}
            {!isDone && (
                <div
                    className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={() => onActionClick(followup.id, "call")}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                        title="Ligar"
                    >
                        <Phone className="w-3 h-3" />
                        Ligar
                    </button>
                    <button
                        type="button"
                        onClick={() => onActionClick(followup.id, "whatsapp")}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                        title="Abrir WhatsApp"
                    >
                        <MessageSquare className="w-3 h-3" />
                        WhatsApp
                    </button>
                    <button
                        type="button"
                        onClick={() => onActionClick(followup.id, "complete")}
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 rounded-md transition-colors"
                        title="Concluir follow-up"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Concluir
                    </button>
                </div>
            )}
        </div>
    );
}

// -------------------------------------------------------------
// QUADRO DO DIA (Atrasados / Manha / Tarde)
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
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", headerStyles.iconBg)}>
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
                        <FollowUpRow key={f.id} followup={f} onActionClick={onActionClick} onRowClick={onRowClick} />
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
    const byOrder = (a: any, b: any) => followupSortKey(a).localeCompare(followupSortKey(b));
    const atrasados = followups
        .filter((f) => f.status === "atrasado")
        .sort((a, b) => String(a.data_agendada).localeCompare(String(b.data_agendada)) || byOrder(a, b));
    const manha = followups.filter((f) => f.status !== "atrasado" && f.periodo === "manha").sort(byOrder);
    const tarde = followups
        .filter((f) => f.status !== "atrasado" && (f.periodo === "tarde" || f.periodo === "noite" || f.periodo === "qualquer"))
        .sort(byOrder);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 h-full p-2 place-content-start">
            <BoardColumn
                kind="atrasados"
                title="Atrasados"
                subtitle={atrasados.length === 1 ? "pendência pra resolver agora" : "pendências pra resolver agora"}
                items={atrasados}
                onActionClick={onActionClick}
                onRowClick={onRowClick}
                emptyLabel="Nenhum atraso"
            />
            <BoardColumn
                kind="manha"
                title="Manhã (8h às 12h)"
                subtitle={manha.length === 1 ? "contato programado" : "contatos programados"}
                items={manha}
                onActionClick={onActionClick}
                onRowClick={onRowClick}
                emptyLabel="Nada pra manhã"
            />
            <BoardColumn
                kind="tarde"
                title="Tarde (13h às 18h)"
                subtitle={tarde.length === 1 ? "contato programado" : "contatos programados"}
                items={tarde}
                onActionClick={onActionClick}
                onRowClick={onRowClick}
                emptyLabel="Nada pra tarde"
            />
        </div>
    );
}
