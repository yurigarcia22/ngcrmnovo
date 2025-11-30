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
            <div className="bg-gray-100 flex items-center px-3 py-1.5 rounded-md border border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Search size={16} className="text-gray-400 mr-2" />
                <input
                    type="text"
                    placeholder="Pesquisar..."
                    className="bg-transparent border-none outline-none text-sm text-gray-700 w-64 placeholder-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Tag Filter */}
            <div className="relative">
                <select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer min-w-[150px]"
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
                    className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer min-w-[150px]"
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
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                >
                    <X size={14} />
                    Limpar
                </button>
            )}
        </div>
    );
}
