function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function CustomersLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <div className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Bone className="h-5 w-24" />
            <Bone className="h-3 w-12" />
          </div>
          <Bone className="h-9 w-24 rounded-2xl shrink-0" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 pt-20 space-y-3">

        {/* Search + filter */}
        <div className="flex gap-2">
          <Bone className="flex-1 h-11 rounded-2xl" />
          <Bone className="h-11 w-24 rounded-2xl shrink-0" />
        </div>

        {/* Meal plans link */}
        <Bone className="h-12 w-full rounded-2xl" />

        {/* Status tabs */}
        <div className="flex rounded-2xl bg-white border border-gray-100 p-1 gap-1 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <Bone key={i} className={`flex-1 h-9 rounded-xl ${i === 0 ? 'bg-orange-50' : ''}`} />
          ))}
        </div>

        {/* Customer cards */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 px-4 py-4 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Bone className="h-4 w-28" />
                  <Bone className="h-5 w-14 rounded-full" />
                </div>
                <div className="flex gap-1.5">
                  <Bone className="h-5 w-24 rounded-full" />
                  <Bone className="h-5 w-16 rounded-full" />
                </div>
                <Bone className="h-3 w-28" />
              </div>
              <div className="space-y-1 text-right shrink-0">
                <Bone className="h-6 w-20 rounded-xl" />
                <Bone className="h-3 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
