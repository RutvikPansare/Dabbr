export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-32">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-[env(safe-area-inset-top)] sticky top-0 z-30">
        <div className="mx-auto max-w-2xl flex items-center justify-between py-4">
          <div>
            <div className="h-5 w-32 rounded-xl bg-gray-100 animate-pulse" />
            <div className="h-3 w-20 rounded-xl bg-gray-100 animate-pulse mt-2" />
          </div>
          <div className="h-9 w-9 rounded-2xl bg-gray-100 animate-pulse" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-3 space-y-2 animate-pulse">
              <div className="h-3 w-12 rounded-lg bg-gray-100" />
              <div className="h-6 w-8 rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between pt-2">
          <div className="h-4 w-28 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-4 w-16 rounded-lg bg-gray-100 animate-pulse" />
        </div>

        {/* Delivery rows */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-2xl bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded-lg bg-gray-100" />
              <div className="h-3 w-20 rounded-lg bg-gray-100" />
            </div>
            <div className="h-7 w-16 rounded-xl bg-gray-100 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
