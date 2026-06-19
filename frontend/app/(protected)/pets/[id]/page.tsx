import { getPetProfile } from "../actions";
import PetProfileClient from "./PetProfileClient";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PetProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const res = await getPetProfile(id);

    if (!res.success || !res.pet) {
        return (
            <div className="p-8 max-w-2xl mx-auto">
                <Link href="/pets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                    <ArrowLeft size={15} /> Voltar para Pets
                </Link>
                <div className="text-center py-16 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                    <p className="text-gray-500">{res.error ?? "Pet não encontrado."}</p>
                </div>
            </div>
        );
    }

    return <PetProfileClient pet={res.pet} appointments={res.appointments ?? []} />;
}
