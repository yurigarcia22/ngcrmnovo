import { LucideIcon } from "lucide-react";

interface KPICardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    trendColor?: "text-green-500" | "text-red-500" | "text-gray-500";
    iconColor?: string;
    iconBg?: string;
}

export default function KPICard({
    title,
    value,
    icon: Icon,
    trend,
    trendColor = "text-green-500",
    iconColor = "text-blue-600",
    iconBg = "bg-blue-50"
}: KPICardProps) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm text-gray-500 font-medium">{title}</p>
                    <h3 className="text-2xl font-bold text-gray-800 mt-1">{value}</h3>
                </div>
                <div className={`p-2 ${iconBg} ${iconColor} rounded-lg`}>
                    <Icon size={20} />
                </div>
            </div>
            {trend && (
                <span className={`text-xs ${trendColor} font-medium mt-4 block`}>
                    {trend}
                </span>
            )}
        </div>
    );
}
