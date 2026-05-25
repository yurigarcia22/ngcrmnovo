import { guardModule } from "@/lib/guard-module";

export default async function ColdCallLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await guardModule("cold_call");
    return <>{children}</>;
}
