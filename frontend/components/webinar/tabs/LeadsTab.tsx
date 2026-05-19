"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, Input } from "@/components/ui/simple-ui";
import {
  Search,
  Sparkles,
  UserPlus,
  Send,
  X,
  Trash2,
  Loader2,
  AlertCircle,
  BotOff,
  Bot,
  ListPlus,
  CheckSquare,
  Square,
  MessageCircle,
} from "lucide-react";
import { LeadConversationDrawer } from "@/components/webinar/LeadConversationDrawer";
import { toast } from "sonner";
import {
  addLeadManually,
  bulkDeleteLeads,
  bulkImportLeads,
  deleteLeadFromCampaign,
  listCampaignLeads,
  sendTestMessageToLead,
  startCampaignScraping,
  pollCampaignScraping,
  toggleLeadAiPause,
} from "@/app/actions-webinar";
import {
  WEBINAR_FUNNEL_LABELS,
  type WebinarCampaign,
  type WebinarCampaignLead,
} from "@/types/webinar";

export function LeadsTab({ campaign }: { campaign: WebinarCampaign }) {
  const router = useRouter();
  const [leads, setLeads] = useState<WebinarCampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const [scrapeStatus, setScrapeStatus] = useState<
    "idle" | "queued" | "running" | "done" | "error"
  >("idle");
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeStarting, setScrapeStarting] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "single" | "bulk";
    leadId?: string;
    count?: number;
  } | null>(null);
  const [conversationLeadId, setConversationLeadId] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const name = (lead.company_name ?? "").toLowerCase();
      const phone = lead.phone ?? "";
      const address = ((lead as any).address ?? "").toLowerCase();
      return (
        name.includes(q) || phone.includes(q.replace(/\D/g, "")) || address.includes(q)
      );
    });
  }, [leads, search]);

  const allFilteredSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedIds.has(l.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      filteredLeads.forEach((l) => next.delete(l.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredLeads.forEach((l) => next.add(l.id));
      setSelectedIds(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function loadLeads() {
    setLoading(true);
    const result = await listCampaignLeads(campaign.id);
    if (result.success) {
      setLeads(result.data ?? []);
    } else {
      toast.error(`Erro: ${result.error}`);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, [campaign.id]);

  // Polling do scraping enquanto job tá ativo
  useEffect(() => {
    if (!campaign.scraping_job_id) {
      setScrapeStatus("idle");
      return;
    }
    if (campaign.scraping_finished_at) {
      setScrapeStatus(campaign.scraping_error ? "error" : "done");
      setScrapeError(campaign.scraping_error ?? null);
      return;
    }
    setScrapeStatus("running");
    let cancelled = false;
    async function loop() {
      while (!cancelled) {
        const r = await pollCampaignScraping(campaign.id);
        if (cancelled) return;
        if (!r.success) {
          setScrapeStatus("error");
          setScrapeError(r.error ?? "erro");
          return;
        }
        if (r.status === "done") {
          setScrapeStatus("done");
          toast.success(
            `Scraping finalizado: ${r.inserted ?? 0} leads novos (${r.total ?? 0} encontrados)`,
          );
          loadLeads();
          router.refresh();
          return;
        }
        if (r.status === "error") {
          setScrapeStatus("error");
          setScrapeError(r.error ?? "erro");
          toast.error(`Scraping falhou: ${r.error}`);
          return;
        }
        if (r.status === "idle") {
          setScrapeStatus("idle");
          return;
        }
        setScrapeStatus(r.status ?? "running");
        await new Promise((res) => setTimeout(res, 8000));
      }
    }
    loop();
    return () => {
      cancelled = true;
    };
  }, [campaign.id, campaign.scraping_job_id, campaign.scraping_finished_at, campaign.scraping_error, router]);

  async function handleStartScraping(maxPerCity: number) {
    setScrapeStarting(true);
    const r = await startCampaignScraping(campaign.id, maxPerCity);
    setScrapeStarting(false);
    if (!r.success) {
      toast.error(`Erro: ${r.error}`);
      return;
    }
    toast.success("Scraping iniciado. Pode levar de 1 a 5 minutos por cidade.");
    setShowScrapeModal(false);
    setScrapeStatus("queued");
    router.refresh();
  }

  function handleSend(lead: WebinarCampaignLead) {
    startTransition(async () => {
      const result = await sendTestMessageToLead(lead.id);
      if (result.success) {
        toast.success(`Mensagem enviada pra ${lead.phone}`);
        loadLeads();
        router.refresh();
      } else {
        toast.error(`Falha: ${result.error}`);
      }
    });
  }

  function handleToggleAi(lead: WebinarCampaignLead) {
    startTransition(async () => {
      const next = !lead.ai_paused;
      const result = await toggleLeadAiPause(lead.id, next);
      if (result.success) {
        toast.success(next ? "IA pausada para este lead" : "IA reativada para este lead");
        loadLeads();
      } else {
        toast.error(`Falha: ${result.error}`);
      }
    });
  }

  function handleDelete(leadId: string) {
    setConfirmDelete({ type: "single", leadId });
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setConfirmDelete({ type: "bulk", count: selectedIds.size });
  }

  function executeDelete() {
    if (!confirmDelete) return;
    startTransition(async () => {
      if (confirmDelete.type === "single" && confirmDelete.leadId) {
        const result = await deleteLeadFromCampaign(confirmDelete.leadId);
        if (result.success) {
          toast.success("Lead excluído");
          loadLeads();
        } else {
          toast.error(`Falha: ${result.error}`);
        }
      } else if (confirmDelete.type === "bulk") {
        const ids = Array.from(selectedIds);
        const result = await bulkDeleteLeads(ids);
        if (result.success) {
          toast.success(`${result.deleted} leads excluídos`);
          setSelectedIds(new Set());
          loadLeads();
        } else {
          toast.error(`Falha: ${result.error}`);
        }
      }
      setConfirmDelete(null);
    });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Card className="p-6">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Ações</h2>
        <p className="text-xs text-slate-500 mb-4">
          Construa a base de leads dessa campanha
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <ActionCard
            icon={Search}
            title="Extrair via scraper"
            description="Usa nicho e cidades pra buscar empresas no Google Maps"
            cta={
              scrapeStatus === "running" || scrapeStatus === "queued"
                ? "Rodando..."
                : "Buscar leads"
            }
            disabled={scrapeStatus === "running" || scrapeStatus === "queued"}
            onClick={() => setShowScrapeModal(true)}
          />
          <ActionCard
            icon={ListPlus}
            title="Importar lista"
            description="Cola uma lista (1 lead por linha). Detecta duplicatas automaticamente"
            cta="Importar"
            onClick={() => setShowImportModal(true)}
          />
          <ActionCard
            icon={UserPlus}
            title="Adicionar manualmente"
            description="Cola um número individual pra teste ou complemento"
            cta="Adicionar lead"
            onClick={() => setShowAddModal(true)}
          />
          <ActionCard
            icon={Sparkles}
            title="Enriquecer com IA"
            description="Classifica leads (hot/warm/cold) e gera ângulo de abordagem"
            cta="Disponível na Fase 3"
            disabled
          />
        </div>

        {(scrapeStatus === "running" || scrapeStatus === "queued") && (
          <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-indigo-900">
                Scraping em andamento
              </p>
              <p className="text-[11px] text-indigo-700">
                Buscando "{campaign.target_nicho}" em{" "}
                {campaign.target_cities?.length ?? 0} cidade(s). Isso leva de 1
                a 5 minutos por cidade. A página atualiza sozinha quando
                terminar.
              </p>
            </div>
          </div>
        )}

        {scrapeStatus === "error" && scrapeError && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-100 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-rose-900">
                Scraping falhou
              </p>
              <p className="text-[11px] text-rose-700">{scrapeError}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Leads da campanha</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {leads.length} cadastrados{search && ` · ${filteredLeads.length} filtrados`}
              {selectedIds.size > 0 && ` · ${selectedIds.size} selecionados`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, endereço"
                className="pl-8 h-8 text-xs w-72"
              />
            </div>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={handleBulkDelete}
                className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Excluir {selectedIds.size}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Carregando...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            {leads.length === 0
              ? "Nenhum lead ainda. Adiciona manualmente acima."
              : "Nenhum lead bate com o filtro."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 pr-2 w-8">
                    <button
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-slate-700"
                      title={allFilteredSelected ? "Desmarcar todos" : "Selecionar todos visíveis"}
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="pb-2 font-semibold text-slate-600">Empresa</th>
                  <th className="pb-2 font-semibold text-slate-600">Telefone</th>
                  <th className="pb-2 font-semibold text-slate-600">Status</th>
                  <th className="pb-2 font-semibold text-slate-600">IA</th>
                  <th className="pb-2 font-semibold text-slate-600 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const isSelected = selectedIds.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className={`border-b border-slate-50 ${
                        isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <td className="py-3 pr-2">
                        <button
                          onClick={() => toggleOne(lead.id)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 text-slate-700">
                        {lead.company_name ?? <span className="text-slate-400">Sem nome</span>}
                        {(lead as any).address && (
                          <div className="text-[11px] text-slate-400 mt-0.5 max-w-md truncate">
                            {(lead as any).address}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-slate-600 font-mono text-xs">{lead.phone}</td>
                      <td className="py-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">
                          {WEBINAR_FUNNEL_LABELS[lead.funnel_status]}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          disabled={pending}
                          onClick={() => handleToggleAi(lead)}
                          title={lead.ai_paused ? "IA pausada. Clique para reativar." : "IA ativa. Clique para pausar."}
                          className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-colors ${
                            lead.ai_paused
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {lead.ai_paused ? (
                            <><BotOff className="w-3 h-3" /> Pausada</>
                          ) : (
                            <><Bot className="w-3 h-3" /> Ativa</>
                          )}
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setConversationLeadId(lead.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Ver conversa completa"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => handleSend(lead)}
                            className="text-xs"
                            title="Manda saudação variada e ativa o agente IA quando o lead responder"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            Iniciar
                          </Button>
                          <button
                            disabled={pending}
                            onClick={() => handleDelete(lead.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                            title="Excluir lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAddModal && (
        <AddLeadModal
          campaignId={campaign.id}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadLeads();
          }}
        />
      )}

      {showScrapeModal && (
        <ScrapeModal
          campaign={campaign}
          starting={scrapeStarting}
          onClose={() => setShowScrapeModal(false)}
          onConfirm={handleStartScraping}
        />
      )}

      {showImportModal && (
        <ImportLeadsModal
          campaignId={campaign.id}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            loadLeads();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          confirmDelete={confirmDelete}
          pending={pending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={executeDelete}
        />
      )}

      <LeadConversationDrawer
        leadId={conversationLeadId}
        onClose={() => setConversationLeadId(null)}
      />
    </div>
  );
}

function ConfirmDeleteModal({
  confirmDelete,
  pending,
  onCancel,
  onConfirm,
}: {
  confirmDelete: { type: "single" | "bulk"; leadId?: string; count?: number };
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isMulti = confirmDelete.type === "bulk";
  const count = confirmDelete.count ?? 1;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Excluir {isMulti ? `${count} leads` : "este lead"}?
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Essa ação é permanente. Mensagens enviadas pra esse{isMulti ? "s lead(s)" : " lead"}{" "}
              também serão removidas. Não tem como desfazer.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportLeadsModal({
  campaignId,
  onClose,
  onImported,
}: {
  campaignId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    added?: number;
    skipped?: number;
    invalid?: number;
    errors?: string[];
  } | null>(null);

  async function handleImport() {
    if (!text.trim()) {
      toast.error("Cola pelo menos 1 lead");
      return;
    }
    setImporting(true);
    const r = await bulkImportLeads(campaignId, text);
    setImporting(false);

    if (!r.success) {
      toast.error(`Erro: ${r.errors?.[0] ?? "falha"}`);
      setResult(r);
      return;
    }
    setResult(r);
    if ((r.added ?? 0) > 0) {
      toast.success(`${r.added} leads adicionados`);
    }
    if ((r.skipped ?? 0) > 0) {
      toast(`${r.skipped} duplicatas ignoradas`);
    }
  }

  function handleFinish() {
    onImported();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Importar lista de leads</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-600 space-y-1">
          <p>Cola a lista abaixo. <strong>Uma linha por lead</strong>. Formatos aceitos:</p>
          <ul className="list-disc list-inside text-[11px] text-slate-500 space-y-0.5 ml-2">
            <li>Só telefone: <code className="font-mono bg-slate-100 px-1 rounded">5511999999999</code></li>
            <li>Telefone, nome: <code className="font-mono bg-slate-100 px-1 rounded">5511999999999, Clínica Pet</code></li>
            <li>Telefone, nome, endereço, site: <code className="font-mono bg-slate-100 px-1 rounded">551199..., Clínica X, Rua Y, https://...</code></li>
          </ul>
          <p className="pt-1 text-[11px]">
            Linhas começando com <code className="font-mono bg-slate-100 px-1 rounded">#</code> são ignoradas.
            Telefones que já existem na campanha (mesmo formato normalizado) são detectados como duplicata.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Lista de leads
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="w-full text-xs font-mono border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
            placeholder={"5511999999999, Clínica Pet Salvador\n5511888888888, Hospital Veterinário X, Rua A 100\n# linhas com # são ignoradas"}
          />
          <p className="text-[11px] text-slate-400">
            {text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).length} linhas válidas
          </p>
        </div>

        {result && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-1 bg-slate-50">
            <p className="text-xs font-semibold text-slate-800">Resultado da importação</p>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="block text-slate-500">Adicionados</span>
                <span className="font-bold text-emerald-600">{result.added ?? 0}</span>
              </div>
              <div>
                <span className="block text-slate-500">Duplicatas</span>
                <span className="font-bold text-amber-600">{result.skipped ?? 0}</span>
              </div>
              <div>
                <span className="block text-slate-500">Inválidos</span>
                <span className="font-bold text-rose-600">{result.invalid ?? 0}</span>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <details className="text-[11px] mt-2">
                <summary className="cursor-pointer text-slate-600">
                  Ver erros ({result.errors.length})
                </summary>
                <ul className="mt-1 space-y-0.5 text-rose-700">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {result ? (
            <>
              <Button variant="outline" onClick={() => { setResult(null); setText(""); }}>
                Importar outra lista
              </Button>
              <Button
                onClick={handleFinish}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                Fechar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !text.trim()}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {importing ? "Importando..." : "Importar"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ScrapeModal({
  campaign,
  starting,
  onClose,
  onConfirm,
}: {
  campaign: WebinarCampaign;
  starting: boolean;
  onClose: () => void;
  onConfirm: (maxPerCity: number) => void;
}) {
  const [maxPerCity, setMaxPerCity] = useState(100);
  const cidades = campaign.target_cities ?? [];
  const cidadesLabel =
    cidades.length === 0
      ? "(nenhuma — define em Setup)"
      : cidades.join(", ");

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Buscar leads no Google Maps
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-600 space-y-2">
          <div>
            <span className="font-semibold text-slate-800">Nicho:</span>{" "}
            {campaign.target_nicho ?? (
              <span className="text-rose-600 italic">não definido</span>
            )}
          </div>
          <div>
            <span className="font-semibold text-slate-800">Cidades:</span>{" "}
            {cidadesLabel}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Máximo de leads por cidade
          </label>
          <Input
            type="number"
            min={10}
            max={500}
            value={maxPerCity}
            onChange={(e) => setMaxPerCity(Number(e.target.value) || 100)}
          />
          <p className="text-[11px] text-slate-400">
            Ex: 100 leads × {cidades.length || 1} cidade(s) ={" "}
            {(maxPerCity * (cidades.length || 1)).toLocaleString("pt-BR")} leads
            no total. Tempo estimado: ~1-5 min por cidade.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[11px] text-amber-800">
          O scraper roda no Easypanel e pode ser bloqueado pelo Google se
          rodar muito seguido. Se acontecer, espera ~30 min e tenta de novo.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(maxPerCity)}
            disabled={
              starting ||
              !campaign.target_nicho ||
              cidades.length === 0
            }
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {starting ? "Iniciando..." : "Iniciar scraping"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddLeadModal({
  campaignId,
  onClose,
  onAdded,
}: {
  campaignId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({ phone: "", company_name: "", website: "" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.phone.trim()) {
      toast.error("Telefone é obrigatório");
      return;
    }
    setSaving(true);
    const result = await addLeadManually(campaignId, {
      phone: form.phone.trim(),
      company_name: form.company_name.trim() || undefined,
      website: form.website.trim() || undefined,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success("Lead adicionado");
    onAdded();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Adicionar lead</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Telefone *</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="5537999577862"
            />
            <p className="text-[11px] text-slate-400">
              Formato internacional sem + (ex: 5511999999999)
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Nome da empresa
            </label>
            <Input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="Petshop Cão Feliz"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Site</label>
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {saving ? "Salvando..." : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  cta,
  disabled,
  onClick,
}: {
  icon: any;
  title: string;
  description: string;
  cta: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const Component: any = disabled ? "div" : "button";
  return (
    <Component
      onClick={disabled ? undefined : onClick}
      className={`text-left border rounded-xl p-4 w-full ${
        disabled
          ? "border-slate-200 bg-slate-50/50 opacity-70"
          : "border-slate-200 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-600" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          disabled ? "text-slate-400" : "text-indigo-600"
        }`}
      >
        {cta}
      </span>
    </Component>
  );
}
