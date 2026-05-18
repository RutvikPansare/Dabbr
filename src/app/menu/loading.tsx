export default function MenuLoading() {
  return (
    <div className="min-h-screen bg-[#FDF8F3] pb-32">
      <div className="bg-white border-b border-gray-100 px-4 pt-[env(safe-area-inset-top)] sticky top-0 z-30">
        <div className="mx-auto max-w-2xl py-4">
          <div className="h-5 w-28 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 pt-4 space-y-3">
        {/* Week strip */}
        <div className="flex gap-2 overflow-hidden">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex-1 rounded-2xl bg-white border border-gray-100 h-16 animate-pulse" />
          ))}
        </div>
        {/* Menu cards */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3 animate-pulse">
            <div className="h-4 w-20 rounded-lg bg-gray-100" />
            <div className="h-3 w-full rounded-lg bg-gray-100" />
            <div className="h-3 w-3/4 rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
