"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { X, Save, Loader2, StickyNote } from "lucide-react";
import { addNote } from "../app/actions";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface NotesPanelProps {
    dealId: string;
    onClose: () => void;
}

export default function NotesPanel({ dealId, onClose }: NotesPanelProps) {
    const [notes, setNotes] = useState<any[]>([]);
    const [newNote, setNewNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        fetchNotes();
    }, [dealId]);

    async function fetchNotes() {
        setFetching(true);
        const { data } = await supabase
            .from("notes")
            .select("*")
            .eq("deal_id", dealId)
            .order("created_at", { ascending: false });

        if (data) setNotes(data);
        setFetching(false);
    }

    async function handleSave() {
        if (!newNote.trim()) return;

        setLoading(true);
        try {
            const result = await addNote(dealId, newNote);
            if (result.success) {
                setNewNote("");
                fetchNotes(); // Recarrega lista
            } else {
                alert("Erro ao salvar nota: " + result.error);
            }
        } catch (error) {
            console.error("Erro ao salvar nota:", error);
            alert("Erro inesperado.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col h-full text-white">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <StickyNote size={18} className="text-yellow-400" />
                    <h3 className="font-bold">Notas Internas</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 custom-scrollbar">
                {fetching ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin text-gray-500" />
                    </div>
                ) : notes.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center italic mt-4">Nenhuma nota registrada.</p>
                ) : (
                    notes.map((note) => (
                        <div key={note.id} className="bg-gray-700/50 p-3 rounded text-sm border border-gray-700">
                            <p className="whitespace-pre-wrap text-gray-200">{note.content}</p>
                            <span className="text-[10px] text-gray-500 mt-2 block text-right">
                                {new Date(note.created_at).toLocaleString()}
                            </span>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-auto">
                <textarea
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-24 mb-2"
                    placeholder="Escreva uma nota..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                />
                <button
                    onClick={handleSave}
                    disabled={loading || !newNote.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Salvar Nota
                </button>
            </div>
        </div>
    );
}
