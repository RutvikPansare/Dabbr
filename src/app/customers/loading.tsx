export default function CustomersLoading() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-32">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-[env(safe-area-inset-top)] sticky top-0 z-30">
        <div className="mx-auto max-w-2xl flex items-center justify-between py-4">
          <div className="h-5 w-24 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-9 w-9 rounded-2xl bg-gray-100 animate-pulse" />
        </div>
        {/* Search bar */}
        <div className="mx-auto max-w-2xl pb-3">
          <div className="h-10 w-full rounded-2xl bg-gray-100 animate-pulse" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4 space-y-3">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
            <div className="h-11 w-11 rounded-2xl bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-28 rounded-lg bg-gray-100" />
              <div className="h-3 w-36 rounded-lg bg-gray-100" />
            </div>
            <div className="h-6 w-14 rounded-xl bg-gray-100 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
