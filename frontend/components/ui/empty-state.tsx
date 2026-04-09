import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
    size?: "sm" | "md" | "lg";
};

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
    size = "md",
}: EmptyStateProps) {
    const sizes = {
        sm: { wrap: "py-8 px-4", icon: "w-10 h-10", iconBox: "w-14 h-14", title: "text-sm", desc: "text-xs" },
        md: { wrap: "py-12 px-6", icon: "w-7 h-7", iconBox: "w-16 h-16", title: "text-base", desc: "text-sm" },
        lg: { wrap: "py-16 px-6", icon: "w-8 h-8", iconBox: "w-20 h-20", title: "text-lg", desc: "text-sm" },
    }[size];

    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center text-center",
                sizes.wrap,
                className
            )}
        >
            {Icon && (
                <div
                    className={cn(
                        "rounded-full bg-slate-100 flex items-center justify-center mb-4",
                        sizes.iconBox
                    )}
                >
                    <Icon className={cn("text-slate-400", sizes.icon)} strokeWidth={1.5} />
                </div>
            )}
            <h3 className={cn("font-semibold text-slate-700", sizes.title)}>{title}</h3>
            {description && (
                <p className={cn("mt-1 text-slate-500 max-w-sm", sizes.desc)}>{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
