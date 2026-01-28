"use client";

import { useEffect, useState } from "react";
import { getNotificationSettings, updateNotificationSettings } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
        // Ensure time format has seconds for Postgres time type if needed, or just HH:MM works if casted. 
        // Postgres TIME usually accepts '09:00'.
        const res = await updateNotificationSettings(settings);
        if (res.success) {
            toast.success("Configurações salvas!");
        } else {
            toast.error("Erro ao salvar configurações");
        }
        setSaving(false);
    };

    if (loading) {
        return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
    }

    return (
        <div className="max-w-2xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Configuração de Notificações</h1>

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

                <div className="pt-4 flex justify-end">
                    <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Salvar
                    </Button>
                </div>

            </div>
        </div>
    );
}
