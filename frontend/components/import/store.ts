'use client';

import { create } from 'zustand';

export interface ImportState {
    step: 'upload' | 'preview' | 'mapping' | 'defaults' | 'summary' | 'completed';
    file: File | null;
    rawRows: any[][];
    headers: string[];
    validRows: any[];
    errors: string[];
    warnings: string[];
    mapping: Record<string, string>; // fileHeader -> crmField
    defaults: {
        ownerId: string;
        status: string;
        tags: string[];
    };
    batchId?: string;

    // Actions
    setStep: (step: ImportState['step']) => void;
    setFile: (file: File) => void;
    setRawData: (rows: any[][], headers: string[]) => void;
    updateMapping: (header: string, field: string) => void;
    setDefaults: (defaults: Partial<ImportState['defaults']>) => void;
    reset: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
    step: 'upload',
    file: null,
    rawRows: [],
    headers: [],
    validRows: [],
    errors: [],
    warnings: [],
    mapping: {},
    defaults: {
        ownerId: '',
        status: 'novo_lead',
        tags: []
    },

    setStep: (step) => set({ step }),
    setFile: (file) => set({ file }),
    setRawData: (rows, headers) => set({ rawRows: rows, headers }),
    updateMapping: (header, field) => set((state) => ({
        mapping: { ...state.mapping, [header]: field }
    })),
    setDefaults: (newDefaults) => set((state) => ({
        defaults: { ...state.defaults, ...newDefaults }
    })),
    reset: () => set({
        step: 'upload',
        file: null,
        rawRows: [],
        headers: [],
        mapping: {},
        defaults: { ownerId: '', status: 'novo_lead', tags: [] }
    })
}));
