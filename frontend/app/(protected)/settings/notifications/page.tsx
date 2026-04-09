"use client";

import { useEffect, useState } from "react";
import { getNotificationSettings, updateNotificationSettings } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/lib/toast";
import { Loader2, Bell, Save } from "lucide-react";

export default function NotificationSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        in_app_enabled: true,
        sound_enabled: true,
        morning_time: '09:00',
        advance_30m_enabled: true,
        advance_5m_enabled: true
    });

    useEffect(() => {
        async function load() {
            setLoading(true);
            const res = await getNotificationSettings();
            if (res.success && res.data) {
                // Ensure time format is HH:MM (remove seconds if present)
                const time = res.data.morning_time?.substring(0, 5) || '09:00';
                setSettings({ ...res.data, morning_time: time });
            }
            setLoading(false);
        }
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        const res = await updateNotificationSettings(settings);
        if (res.success) {
            toast.success("Configuracoes salvas");
        } else {
            toast.error("Erro ao salvar configuracoes");
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto">
                <div className="h-10 w-60 skeleton mb-6" />
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <div className="space-y-2 flex-1">
                                <div className="h-4 w-48 skeleton" />
                                <div className="h-3 w-72 skeleton" />
                            </div>
                            <div className="h-6 w-11 skeleton" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <PageHeader
                title="Notificacoes"
                description="Configure como e quando voce quer ser avisado pelo CRM."
                icon={<Bell className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Notificacoes" },
                ]}
            />

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-8 shadow-sm">

                {/* Global Toggles */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-base">Notificações no CRM</Label>
                            <p className="text-sm text-slate-500">Receber alertas visuais (popup e sino) enquanto usa o sistema.</p>
                        </div>
                        <Switch
                            checked={settings.in_app_enabled}
                            onCheckedChange={v => setSettings(s => ({ ...s, in_app_enabled: v }))}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-base">Sons de Alerta</Label>
                            <p className="text-sm text-slate-500">Tocar um som curto quando chegar uma notificação importante.</p>
                        </div>
                        <Switch
                            checked={settings.sound_enabled}
                            onCheckedChange={v => setSettings(s => ({ ...s, sound_enabled: v }))}
                        />
                    </div>
                </div>

                <hr className="border-slate-100" />

                {/* Schedule Rules */}
                <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-slate-900">Regras de Agendamento</h3>

                    <div className="grid gap-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Resumo do Dia</Label>
                                <p className="text-sm text-slate-500">Horário para receber o lembrete de tarefas do dia.</p>
                            </div>
                            <Input
                                type="time"
                                className="w-32"
                                value={settings.morning_time}
                                onChange={e => setSettings(s => ({ ...s, morning_time: e.target.value }))}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Alertar 30 minutos antes</Label>
                                <p className="text-sm text-slate-500">Aviso prévio para não perder o prazo.</p>
                            </div>
                            <Switch
                                checked={settings.advance_30m_enabled}
                                onCheckedChange={v => setSettings(s => ({ ...s, advance_30m_enabled: v }))}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-base">Alertar 5 minutos antes</Label>
                                <p className="text-sm text-slate-500">Aviso final iminente.</p>
                            </div>
                            <Switch
                                checked={settings.advance_5m_enabled}
                                onCheckedChange={v => setSettings(s => ({ ...s, advance_5m_enabled: v }))}
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-4 flex justify-end border-t border-slate-100">
                    <Button onClick={handleSave} disabled={saving} variant="success">
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Salvar alteracoes
                            </>
                        )}
                    </Button>
                </div>

            </div>
        </div>
    );
}
