function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <div className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Bone className="h-5 w-20" />
            <Bone className="h-3 w-12" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 pt-20 space-y-4">

        {/* Branding card */}
        <div className="rounded-3xl bg-white border border-gray-100 p-5 space-y-4 animate-pulse">
          <Bone className="h-4 w-20" />
          <div className="flex items-center gap-4">
            <Bone className="h-16 w-16 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-32" />
              <Bone className="h-3 w-48" />
            </div>
          </div>
          <Bone className="h-11 w-full rounded-2xl" />
          <Bone className="h-11 w-full rounded-2xl" />
        </div>

        {/* Customer portal card */}
        <div className="rounded-3xl bg-white border border-gray-100 p-5 space-y-3 animate-pulse">
          <Bone className="h-4 w-28" />
          <div className="flex items-center gap-2">
            <Bone className="flex-1 h-10 rounded-2xl" />
            <Bone className="h-10 w-20 rounded-2xl shrink-0" />
            <Bone className="h-10 w-16 rounded-2xl shrink-0" />
          </div>
        </div>

        {/* Meal plans card */}
        <div className="rounded-3xl bg-white border border-gray-100 overflow-hidden animate-pulse">
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
            <Bone className="h-4 w-24" />
            <Bone className="h-8 w-20 rounded-xl" />
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-3 border-b border-gray-50 last:border-0">
              <Bone className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-3.5 w-28" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>

        {/* Quick tags card */}
        <div className="rounded-3xl bg-white border border-gray-100 p-5 space-y-3 animate-pulse">
          <Bone className="h-4 w-28" />
          <div className="flex flex-wrap gap-2">
            {[...Array(6)].map((_, i) => (
              <Bone key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
