import { Draggable } from "@hello-pangea/dnd";
import { User, Link as LinkIcon, MessageCircle, Calendar, Package } from "lucide-react";

interface KanbanCardProps {
    deal: any; // Using any for now to match page.tsx
    index: number;
    fields: any[];
    onClick: (deal: any) => void;
}

export default function KanbanCard({ deal, index, fields, onClick }: KanbanCardProps) {
    return (
        <Draggable draggableId={String(deal.id)} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => onClick(deal)}
                    style={{ ...provided.draggableProps.style }}
                    className={`bg-white border border-gray-200 rounded-lg shadow-sm p-3 mb-2 cursor-grab hover:shadow-md transition-all relative group ${snapshot.isDragging ? "shadow-2xl ring-2 ring-[#2d76f9] rotate-2 scale-105 z-50" : ""
                        } ${deal.status === 'lost' ? 'opacity-75 grayscale-[0.5]' : ''}`}
                >
                    {/* Header: Title and Value */}
                    <div className="mb-2">
                        <div className="flex justify-between items-start">
                            <h4 className="text-sm font-semibold text-gray-800 mb-0.5 truncate pr-2" title={deal.title}>
                                {deal.title}
                            </h4>
                        </div>
                        {deal.value > 0 && (
                            <div className="text-lg font-bold text-gray-700">
                                R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                        )}
                    </div>

                    {/* Body: Contact, Tags, Custom Fields */}
                    <div className="mt-3 space-y-2">
                        {/* Contact Name (Preserved functionality) */}
                        {deal.contacts?.name && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                <User size={12} className="text-gray-400" />
                                <span className="truncate">{deal.contacts.name}</span>
                            </div>
                        )}

                        {/* Products as Tags */}
                        {deal.deal_items && deal.deal_items.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                                {deal.deal_items.map((item: any, i: number) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded text-blue-700 bg-blue-50 font-medium border border-blue-100"
                                    >
                                        <Package size={8} />
                                        {item.products?.name || "Produto"}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Tags */}
                        {deal.deal_tags && deal.deal_tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {deal.deal_tags.map((dt: any, i: number) => (
                                    <span
                                        key={i}
                                        className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-medium opacity-90"
                                        style={{ backgroundColor: dt.tags?.color || '#999' }}
                                    >
                                        {dt.tags?.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Custom Fields */}
                        {fields.filter(f => f.show_in_card).length > 0 && (
                            <div className="flex flex-col gap-y-1">
                                {fields.filter(f => f.show_in_card).map(f => {
                                    const val = deal.custom_values?.[f.id];
                                    if (!val) return null;

                                    const isUrl = typeof val === 'string' && (val.startsWith('http') || val.startsWith('www'));

                                    return (
                                        <div key={f.id} className="text-xs text-gray-500 truncate flex items-center gap-1" title={`${f.name}: ${val}`}>
                                            <span className="font-medium text-gray-600">{f.name}:</span>
                                            {isUrl ? (
                                                <a
                                                    href={val}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 transition-colors"
                                                >
                                                    Abrir Link <LinkIcon size={10} />
                                                </a>
                                            ) : (
                                                <span className="truncate text-gray-500">{val}</span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer: Date and Avatar */}
                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                        {/* Left: Date */}
                        <div className="flex items-center gap-1">
                            {/* <Calendar size={12} /> Optionally add icon */}
                            {new Date(deal.created_at).toLocaleDateString('pt-BR')}
                        </div>

                        {/* Right: Owner Avatar */}
                        <div className="flex items-center">
                            {/* Assuming deal.owner might have avatar_url or name. 
                                 Page.tsx lacked clear owner avatar logic (it used contact name char). 
                                 I'll stick to a generic user icon if no owner info is clearly available, 
                                 or use the first letter of the owner if I can find it. 
                                 Actually page.tsx didn't seem to have deal.owner object populated fully, 
                                 but let's use a placeholder conforming to specs. */}
                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 text-gray-500 font-bold text-[10px]">
                                <User size={14} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Draggable>
    );
}
