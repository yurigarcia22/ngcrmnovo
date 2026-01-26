'use client';

import { FileUploader } from '@/components/import/FileUploader';
import { ImportPreview } from '@/components/import/ImportPreview';
import { ColumnMapper } from '@/components/import/ColumnMapper';
import { ImportDefaults } from '@/components/import/ImportDefaults';
import { ImportSummary } from '@/components/import/ImportSummary';
import { useImportStore } from '@/components/import/store';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ImportPage() {
    const { step, setStep, reset } = useImportStore();

    const renderStep = () => {
        switch (step) {
            case 'upload':
                return <FileUploader />;
            case 'preview':
                return <ImportPreview />;
            case 'mapping':
                return <ColumnMapper />;
            case 'defaults':
                return <ImportDefaults />;
            case 'summary':
                return <ImportSummary />;
            case 'completed':
                return <div>Importação Concluída!</div>;
            default:
                return <FileUploader />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 pb-24">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/cold-call" className="text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Importar Leads</h1>
                        <p className="text-sm text-slate-500">Fluxo de importação segura sem deslocamento de dados.</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="bg-white border border-slate-200 rounded-full h-3 w-full overflow-hidden flex">
                    <div className={`h-full bg-blue-600 transition-all duration-500 ${getProgressWidth(step)}`}></div>
                </div>

                {/* Content */}
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 min-h-[400px]">
                    {renderStep()}
                </div>
            </div>
        </div>
    );
}

function getProgressWidth(step: string) {
    switch (step) {
        case 'upload': return 'w-[10%]';
        case 'preview': return 'w-[30%]';
        case 'mapping': return 'w-[50%]';
        case 'defaults': return 'w-[70%]';
        case 'summary': return 'w-[90%]';
        case 'completed': return 'w-full';
        default: return 'w-0';
    }
}
