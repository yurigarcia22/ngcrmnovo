import { guardModule } from "@/lib/guard-module";

export default async function WebinarLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await guardModule("webinar");
    return <>{children}</>;
}
