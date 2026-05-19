"use client";

import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, Phone, Mail, User, BotOff, AlertTriangle } from "lucide-react";
import {
  getLeadConversation,
  type LeadConversation,
} from "@/app/actions-webinar";
import { WEBINAR_FUNNEL_LABELS } from "@/types/webinar";

interface Props {
  leadId: string | null;
  onClose: () => void;
}

export function LeadConversationDrawer({ leadId, onClose }: Props) {
  const [data, setData] = useState<LeadConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    const r = await getLeadConversation(leadId);
    if (r.success && r.data) {
      setData(r.data);
    } else {
      setError(r.error ?? "erro ao carregar");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!leadId) {
      setData(null);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => {
    // auto-scroll para o fim quando carregar
    if (scrollRef.current && data) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data]);

  if (!leadId) return null;

  const lead = data?.lead;
  const msgs = data?.messages ?? [];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-800 truncate">
                {lead?.company_name ?? "Carregando..."}
              </h2>
              {lead && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {lead.phone}
                </p>
              )}
              {lead && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                    {WEBINAR_FUNNEL_LABELS[
                      lead.funnel_status as keyof typeof WEBINAR_FUNNEL_LABELS
                    ] ?? lead.funnel_status}
                  </span>
                  {lead.last_instance_used && (
                    <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {lead.last_instance_used}
                    </span>
                  )}
                  {lead.ai_paused && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                      <BotOff className="w-3 h-3" />
                      IA pausada
                    </span>
                  )}
                  {lead.auto_paused_at && (
                    <span
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                      title={lead.auto_pause_reason ?? ""}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      auto-pause
                    </span>
                  )}
                </div>
              )}
              {lead && (lead.responsible_name || lead.responsible_email) && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-0.5">
                  {lead.responsible_name && (
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 shrink-0" />
                      <span className="truncate">{lead.responsible_name}</span>
                    </div>
                  )}
                  {lead.responsible_email && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{lead.responsible_email}</span>
                    </div>
                  )}
                  {lead.responsible_direct_phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {lead.responsible_direct_phone}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-500"
                title="Recarregar"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-500"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mensagens */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 bg-[#efeae2] space-y-2"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cg fill='%23d9d2c4' fill-opacity='0.4'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2H0v-2h20v-2H0V8h20V6H0V4h20V2H0V0h22v20h2V0h2v20h2V0h2v20h2V0h2v20h2V0h2v20h2v2H20v-1.5zM0 20h2v20H0V20zm4 0h2v20H4V20zm4 0h2v20H8V20zm4 0h2v20h-2V20zm4 0h2v20h-2V20zm4 4h20v2H20v-2zm0 4h20v2H20v-2zm0 4h20v2H20v-2zm0 4h20v2H20v-2z'/%3E%3C/g%3E%3C/svg%3E\")",
          }}
        >
          {loading && (
            <div className="text-center py-8 text-sm text-slate-500">
              Carregando conversa...
            </div>
          )}
          {error && (
            <div className="text-center py-8 text-sm text-rose-600 bg-white rounded-lg p-4">
              {error}
            </div>
          )}
          {!loading && !error && msgs.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-500 bg-white/60 rounded-lg p-4">
              Nenhuma mensagem trocada com esse lead ainda.
            </div>
          )}
          {msgs.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500 text-center">
          {msgs.length} mensagens · só visualização (não envia daqui)
        </div>
      </div>
    </>
  );
}

function MessageBubble({
  msg,
}: {
  msg: LeadConversation["messages"][number];
}) {
  const isOut = msg.direction === "outbound";
  const time = msg.sent_at
    ? new Date(msg.sent_at).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const date = msg.sent_at
    ? new Date(msg.sent_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  const isFailover = msg.ai_metadata?.type === "failover_bridge";
  const isAutoReplyMeta =
    msg.ai_metadata?.type === "auto_reply_detected_skipped" ||
    msg.ai_metadata?.type === "loop_detected_auto_pause";

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-3 py-2 shadow-sm ${
          isOut
            ? "bg-[#d9fdd3] text-slate-900"
            : isAutoReplyMeta
              ? "bg-amber-50 text-slate-900 border border-amber-200"
              : "bg-white text-slate-900"
        }`}
      >
        {isFailover && (
          <div className="text-[9px] uppercase tracking-wider font-bold text-amber-600 mb-1">
            ⚡ failover bridge
          </div>
        )}
        {isAutoReplyMeta && (
          <div className="text-[9px] uppercase tracking-wider font-bold text-amber-700 mb-1">
            🤖 auto-reply ignorado
          </div>
        )}
        {msg.text ? (
          <p className="text-sm whitespace-pre-wrap break-words leading-snug">
            {msg.text}
          </p>
        ) : (
          <p className="text-xs italic text-slate-400">(mensagem sem texto)</p>
        )}
        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-500">
          {msg.instance_used && isOut && (
            <span className="font-mono text-[9px] mr-1">
              {msg.instance_used.length > 18
                ? msg.instance_used.slice(0, 14) + "…"
                : msg.instance_used}
            </span>
          )}
          {date && <span>{date}</span>}
          {time && <span>{time}</span>}
          {isOut && msg.status === "failed" && (
            <span className="text-rose-600 font-bold">✗</span>
          )}
          {isOut && msg.status === "read" && <span>✓✓</span>}
          {isOut && msg.status === "delivered" && <span>✓✓</span>}
          {isOut && msg.status === "sent" && <span>✓</span>}
        </div>
      </div>
    </div>
  );
}
