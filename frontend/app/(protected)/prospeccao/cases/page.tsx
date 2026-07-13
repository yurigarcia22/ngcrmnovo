import { listCases } from "../actions";
import CasesClient from "./CasesClient";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
    const res = await listCases();
    return <CasesClient initialCases={res.cases || []} />;
}
