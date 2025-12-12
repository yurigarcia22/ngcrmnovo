import { Building2 } from "lucide-react";

export default function CompanySettingsPage() {
    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Building2 className="text-blue-600" />
                Configurações da Empresa
            </h1>
            <p className="text-gray-500 mb-8">Gerencie os dados da sua organização.</p>

            <div className="bg-white p-12 rounded-xl border border-gray-200 text-center">
                <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 size={32} className="text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Em Breve</h3>
                <p className="text-gray-500 mt-2">Esta funcionalidade estará disponível nas próximas atualizações.</p>
            </div>
        </div>
    );
}
