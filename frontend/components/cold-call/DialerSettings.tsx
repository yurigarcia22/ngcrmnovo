"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneCall, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { DIALER_PRESETS, getDialerConfig, setDialerConfig, buildDialUrl, type DialerId } from "@/lib/dialer";

/**
 * Configuracao do discador por MAQUINA (localStorage): o parceiro no Mac usa
 * Smart SIP Phone, o time no Windows usa MicroSIP. Cada um escolhe o seu.
 */
export function DialerSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const [id, setId] = useState<DialerId>("sip");
    const [template, setTemplate] = useState("");
    const [testPhone, setTestPhone] = useState("11999999999");

    useEffect(() => {
        if (!open) return;
        const cfg = getDialerConfig();
        setId(cfg.id);
        setTemplate(cfg.template ?? "");
    }, [open]);

    function save() {
        if (id === "custom" && !template.includes("{phone}") && !template.includes("{digits}")) {
            toast.error("O formato precisa ter {phone} ou {digits}", "Ex: minhaapp://call?number={digits}");
            return;
        }
        setDialerConfig({ id, template: id === "custom" ? template.trim() : undefined });
        toast.success("Discador salvo", "Vale para este computador.");
        onOpenChange(false);
    }

    const preview = buildDialUrl(testPhone, { id, template });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-white p-6">
                <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Settings2 className="text-indigo-600" size={20} /> Discador deste computador
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                    Escolha o programa que abre ao clicar em ligar. A escolha vale só neste computador —
                    cada pessoa do time configura o seu.
                </DialogDescription>

                <div className="mt-3 space-y-2">
                    {DIALER_PRESETS.map((p) => (
                        <label
                            key={p.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                id === p.id ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 hover:border-slate-300"
                            }`}
                        >
                            <input
                                type="radio"
                                name="dialer"
                                checked={id === p.id}
                                onChange={() => setId(p.id)}
                                className="mt-0.5"
                            />
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800">{p.label}</span>
                                <span className="block text-xs text-slate-500">{p.hint}</span>
                                {p.scheme && <span className="block text-[11px] font-mono text-slate-400 mt-0.5">{p.scheme}</span>}
                            </span>
                        </label>
                    ))}
                </div>

                {id === "custom" && (
                    <div className="mt-3">
                        <label htmlFor="dialer-template" className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Formato do link
                        </label>
                        <input
                            id="dialer-template"
                            value={template}
                            onChange={(e) => setTemplate(e.target.value)}
                            placeholder="ex: smartsip://call?number={phone}"
                            className="w-full px-3 py-2 text-sm font-mono text-slate-800 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 placeholder:text-slate-400"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                            Use <code className="bg-slate-100 px-1 rounded">{"{phone}"}</code> para +5511999999999 ou{" "}
                            <code className="bg-slate-100 px-1 rounded">{"{digits}"}</code> para 5511999999999.
                        </p>
                    </div>
                )}

                <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Testar</p>
                    <div className="flex items-center gap-2">
                        <input
                            value={testPhone}
                            onChange={(e) => setTestPhone(e.target.value)}
                            aria-label="Telefone de teste"
                            className="flex-1 px-2.5 py-1.5 text-sm text-slate-800 border border-slate-300 rounded-lg"
                        />
                        <button
                            onClick={() => { window.location.href = preview; }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                        >
                            <PhoneCall size={14} /> Testar ligação
                        </button>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 mt-2 break-all">{preview}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Se o programa certo não abrir, tente outra opção acima. No Mac, o app precisa estar instalado e
                        aberto ao menos uma vez para o sistema reconhecê-lo.
                    </p>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => onOpenChange(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
                        Cancelar
                    </button>
                    <button onClick={save} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                        Salvar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Botao de engrenagem que abre a configuracao (usado na barra do cold-call). */
export function DialerSettingsButton() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 h-10 rounded-md border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:border-slate-300 hover:bg-slate-50 transition-colors"
                title="Configurar o discador deste computador"
            >
                <Phone size={15} /> Discador
            </button>
            <DialerSettings open={open} onOpenChange={setOpen} />
        </>
    );
}
