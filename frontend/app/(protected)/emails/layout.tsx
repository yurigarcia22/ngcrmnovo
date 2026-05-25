import { guardModule } from "@/lib/guard-module";

export default async function EmailsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await guardModule("emails");
    return <>{children}</>;
}
