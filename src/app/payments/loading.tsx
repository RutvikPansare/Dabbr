function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function PaymentsLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <div className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Bone className="h-5 w-20" />
            <Bone className="h-3 w-16" />
          </div>
          <Bone className="h-9 w-20 rounded-2xl shrink-0" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 pt-20 space-y-4">

        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2 animate-pulse">
              <Bone className="h-3 w-16" />
              <Bone className="h-8 w-24" />
              <Bone className="h-2.5 w-20" />
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex rounded-xl bg-white border border-gray-100 p-1 gap-1 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <Bone key={i} className={`flex-1 h-9 rounded-lg ${i === 0 ? 'bg-orange-50' : ''}`} />
          ))}
        </div>

        {/* Payment rows */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 px-4 py-4 flex items-center gap-3 animate-pulse">
            <Bone className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-4 w-28" />
              <Bone className="h-3 w-20" />
            </div>
            <div className="text-right space-y-1 shrink-0">
              <Bone className="h-4 w-16" />
              <Bone className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
