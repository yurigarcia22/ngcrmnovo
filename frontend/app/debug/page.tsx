import { getConversations } from "../actions";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
    const res = await getConversations();

    return (
        <div className="p-8 font-mono text-xs">
            <h1 className="text-xl font-bold mb-4">Debug Chat Data</h1>
            <pre className="bg-gray-100 p-4 rounded overflow-auto border border-gray-300">
                {JSON.stringify(res, null, 2)}
            </pre>
        </div>
    );
}
