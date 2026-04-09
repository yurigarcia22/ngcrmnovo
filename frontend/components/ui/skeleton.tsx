import * as React from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            className={cn("skeleton", className)}
            {...props}
        />
    );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
    return (
        <div className={cn("space-y-2", className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className="h-3"
                    style={{ width: `${100 - i * 15}%` }}
                />
            ))}
        </div>
    );
}

export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn("p-4 bg-white rounded-xl border border-slate-200 space-y-3", className)}>
            <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            </div>
            <SkeletonText lines={2} />
        </div>
    );
}
