function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* ── Desktop sticky header ── */}
      <div className="hidden lg:flex items-center sticky top-0 z-30 px-8 pt-6 pb-4 bg-[#FAF8F5]/90 backdrop-blur-sm">
        <div className="flex-1 space-y-1.5">
          <Bone className="h-3.5 w-36" />
          <Bone className="h-6 w-56" />
        </div>
        <Bone className="h-7 w-24 shrink-0" />
      </div>

      {/* ── Mobile header ── */}
      <div className="lg:hidden bg-orange-500 px-4 pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3 w-24 bg-white/20" />
            <Bone className="h-5 w-44 bg-white/20" />
          </div>
          <Bone className="h-9 w-9 rounded-xl bg-white/20 shrink-0" />
        </div>
      </div>

      {/* ── Desktop stat tiles ── */}
      <div className="hidden lg:grid px-8 pt-3 pb-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2 animate-pulse">
            <Bone className="h-3 w-12" />
            <Bone className="h-8 w-10" />
            <Bone className="h-2.5 w-16" />
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4 space-y-4 lg:max-w-none lg:px-8">

        {/* Mobile stat cards */}
        <div className="grid grid-cols-3 gap-2 lg:hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-3 space-y-2 animate-pulse">
              <Bone className="h-2.5 w-10" />
              <Bone className="h-7 w-8" />
              <Bone className="h-2 w-12" />
            </div>
          ))}
        </div>

        {/* Date + slot filter */}
        <div className="space-y-2">
          <Bone className="h-4 w-32" />
          <div className="flex gap-1 rounded-xl bg-white border border-gray-100 p-1">
            {[...Array(4)].map((_, i) => (
              <Bone key={i} className={`flex-1 h-10 rounded-lg ${i === 0 ? 'bg-orange-50' : ''}`} />
            ))}
          </div>
        </div>

        {/* Cook List + Packing List */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-4 animate-pulse">
            <div className="flex items-center gap-3">
              <Bone className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-24" />
                <Bone className="h-3 w-36" />
              </div>
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-2.5 w-2.5 rounded-full shrink-0" />
                <Bone className="flex-1 h-3" />
                <Bone className="h-5 w-6 shrink-0" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-4 animate-pulse">
            <div className="flex items-center gap-3">
              <Bone className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-24" />
                <Bone className="h-3 w-36" />
              </div>
              <Bone className="h-7 w-16 rounded-full shrink-0" />
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-3 w-20" />
                  <div className="flex gap-1.5">
                    <Bone className="h-5 w-16 rounded-full" />
                    <Bone className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery card */}
        <div className="rounded-3xl bg-white border border-gray-100 overflow-hidden animate-pulse">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
            <Bone className="h-10 w-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-4 w-36" />
              <Bone className="h-3 w-24" />
            </div>
            <Bone className="h-9 w-20 rounded-2xl shrink-0" />
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0">
              <Bone className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-3.5 w-28" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-7 w-20 rounded-xl shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
