'use client';

import { useImportStore } from './store';
import { Button, Input } from '@/components/ui/simple-ui';
import { ArrowRight, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';

const CRM_FIELDS = [
    { label: 'Nome (Obrigatório)', value: 'nome', required: true },
    { label: 'Telefone', value: 'telefone', required: true },
    { label: 'Nicho', value: 'nicho', required: true },
    { label: 'Email', value: 'email' },
    { label: 'Site (URL)', value: 'site_url' },
    { label: 'Instagram (URL)', value: 'instagram_url' },
    { label: 'Google Meu Negócio (URL)', value: 'google_meu_negocio_url' },
    { label: 'Notas / Observações', value: 'notas' },
];

export function ColumnMapper() {
    const { headers, mapping, updateMapping, setStep, reset } = useImportStore();
    const [customFields, setCustomFields] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newFieldLabel, setNewFieldLabel] = useState('');

    // Fetch custom fields
    useEffect(() => {
        // Mock fetch or real fetch if API existed. 
        // For now, let's just use local state for "created during session" + hardcoded if we had API.
        // real implementation would fetch from /api/custom-fields
    }, []);

    const allFields = [...CRM_FIELDS, ...customFields];

    // Auto-map on mount
    useEffect(() => {
        headers.forEach(header => {
            if (mapping[header]) return; // already mapped

            const lowerHeader = header.toLowerCase();
            const found = allFields.find(f => {
                const label = f.label.toLowerCase();
                return label.includes(lowerHeader) || lowerHeader.includes(f.value.split('_')[0]);
            });

            if (found) {
                updateMapping(header, found.value);
            }
        });
    }, [headers, allFields, mapping, updateMapping]);


    const handleCreateCustomField = () => {
        if (!newFieldLabel) return;
        const slug = 'cf_' + newFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // In a real app, we would POST to backend here to Create Definition
        const newField = { label: newFieldLabel, value: slug, isCustom: true };

        setCustomFields([...customFields, newField]);
        setNewFieldLabel('');
        setIsModalOpen(false);
        toast.success(`Campo personalizado "${newFieldLabel}" criado!`);
    };

    const handleNext = () => {
        // Validate required fields
        const mappedValues = Object.values(mapping);
        const missingRequired = CRM_FIELDS.filter(f => f.required && !mappedValues.includes(f.value));

        if (missingRequired.length > 0) {
            toast.error(`Campos obrigatórios faltando: ${missingRequired.map(f => f.label).join(', ')}`);
            return;
        }

        setStep('defaults'); // Next step
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Mapeamento de Colunas</h2>
                    <p className="text-sm text-slate-500">
                        Associe as colunas do seu arquivo aos campos do CRM.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={reset}>Cancelar</Button>
                    <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white">
                        Próximo: Padrões
                    </Button>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-1/3">Coluna do Arquivo</th>
                            <th className="p-4 w-12 text-center"><ArrowRight className="h-4 w-4 mx-auto text-slate-400" /></th>
                            <th className="p-4 w-1/3">Campo no CRM</th>
                            <th className="p-4 text-right">Amostra (Linha 1)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {headers.map((header, index) => {
                            // Get sample data from store? we need rawRows from store
                            // we can use a store selector but let's assume we pass it or just use headers
                            // For simplicity visualizing, let's just map.
                            return (
                                <tr key={index} className="hover:bg-slate-50">
                                    <td className="p-4 font-medium text-slate-700">{header}</td>
                                    <td className="p-4 text-center"><ArrowRight className="h-4 w-4 mx-auto text-slate-300" /></td>
                                    <td className="p-4">
                                        <select
                                            className="w-full text-sm border-slate-200 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                                            value={mapping[header] || ''}
                                            onChange={(e) => {
                                                if (e.target.value === '__create_new__') {
                                                    setIsModalOpen(true);
                                                } else {
                                                    updateMapping(header, e.target.value);
                                                }
                                            }}
                                        >
                                            <option value="">-- Ignorar coluna --</option>
                                            <optgroup label="Campos Padrão">
                                                {CRM_FIELDS.map(field => (
                                                    <option key={field.value} value={field.value}>
                                                        {field.label} {field.required ? '*' : ''}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            {customFields.length > 0 && (
                                                <optgroup label="Campos Personalizados">
                                                    {customFields.map(field => (
                                                        <option key={field.value} value={field.value}>{field.label}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <option value="__create_new__" className="text-blue-600 font-bold">+ Criar novo campo...</option>
                                        </select>
                                    </td>
                                    <td className="p-4 text-right text-slate-400 italic text-xs max-w-[200px] truncate">
                                        {/* Sample would go here if we accessed rawRows[0][index] */}
                                        Amostra indisponível
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Create Field Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold">Criar Campo Personalizado</h3>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome do Campo</label>
                            <Input
                                value={newFieldLabel}
                                onChange={e => setNewFieldLabel(e.target.value)}
                                placeholder="Ex: CPF, Data de Nascimento"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleCreateCustomField} disabled={!newFieldLabel}>Criar Campo</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
