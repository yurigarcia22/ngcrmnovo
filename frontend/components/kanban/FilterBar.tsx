import { Search, Filter, X } from "lucide-react";

interface FilterBarProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filterTag: string;
    setFilterTag: (tag: string) => void;
    filterDate: string;
    setFilterDate: (date: string) => void;
    availableTags: any[];
}

export default function FilterBar({
    searchTerm,
    setSearchTerm,
    filterTag,
    setFilterTag,
    filterDate,
    setFilterDate,
    availableTags
}: FilterBarProps) {
    const hasActiveFilters = searchTerm || filterTag !== 'all' || filterDate !== 'all';

    const clearFilters = () => {
        setSearchTerm("");
        setFilterTag("all");
        setFilterDate("all");
    };

    return (
        <div className="flex items-center gap-2">
            {/* Search Bar */}
            <div className="flex-1 min-w-[200px] bg-white flex items-center px-3 py-2 rounded-lg border border-slate-200 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 transition-all shadow-sm">
                <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                <input
                    type="text"
                    placeholder="Pesquisar leads, empresas ou contatos..."
                    className="bg-transparent border-none outline-none text-sm text-slate-700 w-full placeholder-slate-400 font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Tag Filter */}
            <div className="relative">
                <select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer min-w-[160px] shadow-sm hover:border-slate-300"
                >
                    <option value="all">Todas as Etiquetas</option>
                    {availableTags.map(tag => (
                        <option key={tag.id} value={tag.id}>
                            {tag.name}
                        </option>
                    ))}
                </select>
                <Filter size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Date Filter */}
            <div className="relative">
                <select
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer min-w-[160px] shadow-sm hover:border-slate-300"
                >
                    <option value="all">Todo o período</option>
                    <option value="today">Hoje</option>
                    <option value="last7">Últimos 7 dias</option>
                    <option value="last30">Últimos 30 dias</option>
                    <option value="thisMonth">Este Mês</option>
                </select>
                <Filter size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
                <button
                    onClick={clearFilters}
                    className="text-xs text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-100"
                >
                    <X size={14} />
                    Limpar Filtros
                </button>
            )}
        </div>
    );
}
