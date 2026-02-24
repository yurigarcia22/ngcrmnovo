"use client";

import { useState, useEffect } from "react";
import { PhoneOutgoing } from "lucide-react";
import { Switch } from "@/components/ui/switch"; // Assuming a Switch component exists or I can use native toggle

interface AutoDialToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

export function AutoDialToggle({ enabled, onChange }: AutoDialToggleProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null; // Prevent SSR mismatch

    return (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md shadow-sm">
            <PhoneOutgoing className={`h-4 w-4 ${enabled ? "text-emerald-500" : "text-slate-400"}`} />
            <span className="text-sm font-medium text-slate-700 whitespace-nowrap hidden sm:inline-block">
                Discagem Automática
            </span>
            <label className="relative inline-flex items-center cursor-pointer ml-1">
                <input
                    type="checkbox"
                    value=""
                    className="sr-only peer"
                    checked={enabled}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
        </div>
    );
}
