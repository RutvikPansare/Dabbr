function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function MenuLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <div className="fixed inset-x-0 top-0 z-40 lg:left-[220px] bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Bone className="h-5 w-32" />
            <Bone className="h-3 w-20" />
          </div>
          {/* Week nav */}
          <div className="flex items-center gap-2 shrink-0">
            <Bone className="h-9 w-9 rounded-2xl" />
            <Bone className="h-9 w-28 rounded-2xl" />
            <Bone className="h-9 w-9 rounded-2xl" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 pt-20 space-y-3">

        {/* Week day strip */}
        <div className="flex gap-1.5">
          {[...Array(7)].map((_, i) => (
            <div key={i} className={`flex-1 rounded-2xl h-16 animate-pulse ${i === 0 ? 'bg-orange-100' : 'bg-white border border-gray-100'}`} />
          ))}
        </div>

        {/* Slot filter */}
        <div className="flex rounded-xl bg-white border border-gray-100 p-1 gap-1 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <Bone key={i} className={`flex-1 h-9 rounded-lg ${i === 0 ? 'bg-orange-50' : ''}`} />
          ))}
        </div>

        {/* Menu slot cards — Breakfast, Lunch, Dinner */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3 animate-pulse">
            {/* Slot header */}
            <div className="flex items-center gap-2">
              <Bone className="h-4 w-4 rounded-full shrink-0" />
              <Bone className="h-4 w-20" />
            </div>
            {/* Dish input */}
            <Bone className="h-11 w-full rounded-2xl" />
            {/* Quick tags */}
            <div className="flex flex-wrap gap-1.5">
              {[...Array(5)].map((_, j) => (
                <Bone key={j} className="h-7 w-20 rounded-full" />
              ))}
            </div>
            {/* Save button */}
            <Bone className="h-10 w-full rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
