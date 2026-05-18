export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-32">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-[env(safe-area-inset-top)] sticky top-0 z-30">
        <div className="mx-auto max-w-2xl py-4">
          <div className="h-5 w-16 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-6 space-y-4">
        {/* Profile card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5 flex items-center gap-4 animate-pulse">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-32 rounded-lg bg-gray-100" />
            <div className="h-3 w-40 rounded-lg bg-gray-100" />
          </div>
        </div>

        {/* Setting sections */}
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 overflow-hidden animate-pulse">
            <div className="px-5 py-3 border-b border-gray-50">
              <div className="h-3 w-24 rounded-lg bg-gray-100" />
            </div>
            {[...Array(3)].map((_, j) => (
              <div key={j} className="px-5 py-4 flex items-center justify-between border-b border-gray-50 last:border-0">
                <div className="h-3.5 w-28 rounded-lg bg-gray-100" />
                <div className="h-3 w-16 rounded-lg bg-gray-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
