function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function SummaryLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <div className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Bone className="h-5 w-20" />
            <Bone className="h-3 w-16" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-4xl px-4 lg:px-8 pt-20 space-y-5">

        {/* This month / This week tabs */}
        <div className="flex rounded-xl bg-white border border-gray-100 p-1 gap-1 animate-pulse">
          <Bone className="flex-1 h-9 rounded-lg bg-orange-50" />
          <Bone className="flex-1 h-9 rounded-lg" />
        </div>

        {/* Active + Payments row */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-2xl bg-white border border-gray-100 p-4 space-y-2 animate-pulse">
            <Bone className="h-3 w-12" />
            <Bone className="h-8 w-8" />
            <Bone className="h-2.5 w-16" />
          </div>
          <div className="flex-1 rounded-2xl bg-green-50 border border-green-100 p-4 space-y-2 animate-pulse">
            <Bone className="h-3 w-16 bg-green-100" />
            <Bone className="h-5 w-16 bg-green-100" />
            <Bone className="h-2.5 w-20 bg-green-100" />
          </div>
        </div>

        {/* Revenue card */}
        <div className="rounded-2xl bg-orange-500/10 border border-orange-100 p-5 space-y-3 animate-pulse">
          <Bone className="h-3 w-28 bg-orange-200" />
          <Bone className="h-10 w-24 bg-orange-200" />
          <Bone className="h-3 w-40 bg-orange-200" />
        </div>

        {/* Pending payments */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
          <Bone className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-3 w-36" />
          </div>
          <Bone className="h-4 w-12 shrink-0" />
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2 animate-pulse">
              <Bone className="h-8 w-8 rounded-xl" />
              <Bone className="h-7 w-10" />
              <Bone className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
