export default function DashboardLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0284c7] via-[#0369a1] to-[#0c4a6e] p-8 font-sans">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between mb-8 gap-4 animate-pulse">
                <div className="h-10 bg-white/10 rounded-lg flex-1 max-w-2xl"></div>
                <div className="h-10 w-32 bg-white/10 rounded-lg"></div>
            </div>

            {/* Title & Filter Skeleton */}
            <div className="text-center mb-8 animate-pulse">
                <div className="h-10 w-48 bg-white/10 rounded mx-auto mb-6"></div>
                <div className="h-12 bg-white/10 rounded-full w-full max-w-2xl mx-auto"></div>
            </div>

            {/* Content Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
                {/* Row 1 */}
                <div className="lg:col-span-2 md:col-span-2 h-[200px] bg-white/10 rounded-xl"></div>
                <div className="h-[200px] bg-white/10 rounded-xl"></div>
                <div className="h-[200px] bg-white/10 rounded-xl"></div>

                {/* Row 2 */}
                <div className="h-[180px] bg-white/10 rounded-xl"></div>
                <div className="h-[180px] bg-white/10 rounded-xl"></div>
                <div className="h-[180px] bg-white/10 rounded-xl"></div>

                {/* Radial Chart Area */}
                <div className="lg:col-span-2 md:col-span-2 h-[300px] bg-white/10 rounded-xl"></div>

                <div className="h-[180px] bg-white/10 rounded-xl"></div>
                <div className="h-[180px] bg-white/10 rounded-xl"></div>
            </div>
        </div>
    );
}
