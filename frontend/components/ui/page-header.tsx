import * as React from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    breadcrumbs?: Array<{ label: string; href?: string }>;
    className?: string;
};

export function PageHeader({
    title,
    description,
    icon,
    actions,
    breadcrumbs,
    className,
}: PageHeaderProps) {
    return (
        <div
            className={cn(
                "flex flex-col gap-4 pb-6 mb-6 border-b border-slate-200",
                className
            )}
        >
            {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
                    {breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <span className="text-slate-300">/</span>}
                            {crumb.href ? (
                                <a href={crumb.href} className="hover:text-slate-800 transition-colors">
                                    {crumb.label}
                                </a>
                            ) : (
                                <span className="text-slate-700 font-medium">{crumb.label}</span>
                            )}
                        </React.Fragment>
                    ))}
                </nav>
            )}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                    {icon && (
                        <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            {icon}
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight text-balance">
                            {title}
                        </h1>
                        {description && (
                            <p className="mt-1 text-sm text-slate-500 max-w-2xl text-pretty">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
                {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </div>
        </div>
    );
}
