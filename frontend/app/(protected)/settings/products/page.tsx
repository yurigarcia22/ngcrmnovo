"use client";

import { useState, useEffect } from "react";
import { getProducts, createProduct, updateProduct, deleteProduct } from "./actions";
import { Plus, Search, Edit2, Trash2, Package, Loader2 } from "lucide-react";

export default function ProductsPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchProducts();
    }, [search]);

    async function fetchProducts() {
        setLoading(true);
        const res = await getProducts(search);
        if (res.success) {
            setProducts(res.data || []);
        }
        setLoading(false);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setActionLoading(true);

        const formData = new FormData(e.currentTarget);

        let res;
        if (editingProduct) {
            res = await updateProduct(editingProduct.id, formData);
        } else {
            res = await createProduct(formData);
        }

        if (res.success) {
            setIsModalOpen(false);
            setEditingProduct(null);
            fetchProducts();
            alert(editingProduct ? "Produto atualizado!" : "Produto criado!");
        } else {
            alert("Erro: " + res.error);
        }

        setActionLoading(false);
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir este produto?")) return;

        const res = await deleteProduct(id);
        if (res.success) {
            fetchProducts();
        } else {
            alert("Erro ao excluir: " + res.error);
        }
    }

    const openModal = (product?: any) => {
        setEditingProduct(product || null);
        setIsModalOpen(true);
    };

    return (
        <div className="flex-1 p-8 text-gray-800">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 text-gray-800 flex items-center gap-2">
                            <Package className="text-blue-600" />
                            Produtos
                        </h1>
                        <p className="text-gray-500">Gerencie seu catálogo de produtos e serviços.</p>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <Plus size={20} />
                        Novo Produto
                    </button>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* Toolbar */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar produtos..."
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-2">
                            <Loader2 className="animate-spin text-blue-500" size={32} />
                            Carregando...
                        </div>
                    ) : products.length === 0 ? (
                        <div className="p-12 text-center text-gray-500 bg-gray-50/50">
                            Nenhum produto encontrado. Adicione o primeiro!
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider border-b border-gray-200">
                                    <th className="p-4 font-semibold">Nome</th>
                                    <th className="p-4 font-semibold">Preço Unitário</th>
                                    <th className="p-4 font-semibold">Descrição</th>
                                    <th className="p-4 font-semibold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {products.map(product => (
                                    <tr key={product.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-4 font-medium text-gray-800">{product.name}</td>
                                        <td className="p-4 text-green-700 font-medium">
                                            R$ {parseFloat(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-gray-500 text-sm max-w-xs truncate">{product.description || "-"}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openModal(product)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product.id)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
                        <form onSubmit={handleSubmit}>
                            <div className="p-6 border-b border-gray-100">
                                <h3 className="text-xl font-bold text-gray-800">
                                    {editingProduct ? "Editar Produto" : "Novo Produto"}
                                </h3>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto *</label>
                                    <input
                                        name="name"
                                        defaultValue={editingProduct?.name}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
                                    <input
                                        name="price"
                                        type="number"
                                        step="0.01"
                                        defaultValue={editingProduct?.price}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                                    <textarea
                                        name="description"
                                        rows={3}
                                        defaultValue={editingProduct?.description}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    />
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2"
                                >
                                    {actionLoading && <Loader2 size={16} className="animate-spin" />}
                                    {editingProduct ? "Salvar Alterações" : "Criar Produto"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
