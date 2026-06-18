import { getAllPets } from "./actions";
import PetsPageClient from "./PetsPageClient";

export const dynamic = "force-dynamic";

export default async function PetsPage() {
    const res = await getAllPets();
    return <PetsPageClient initialPets={res.pets ?? []} />;
}
