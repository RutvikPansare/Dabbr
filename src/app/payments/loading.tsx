export default function PaymentsLoading() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-32">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-[env(safe-area-inset-top)] sticky top-0 z-30">
        <div className="mx-auto max-w-2xl flex items-center justify-between py-4">
          <div className="h-5 w-20 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-9 w-24 rounded-2xl bg-gray-100 animate-pulse" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2 animate-pulse">
              <div className="h-3 w-16 rounded-lg bg-gray-100" />
              <div className="h-7 w-20 rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>

        {/* Section label */}
        <div className="h-4 w-28 rounded-lg bg-gray-100 animate-pulse pt-2" />

        {/* Payment rows */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-2xl bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-24 rounded-lg bg-gray-100" />
              <div className="h-3 w-16 rounded-lg bg-gray-100" />
            </div>
            <div className="h-5 w-16 rounded-xl bg-gray-100 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
