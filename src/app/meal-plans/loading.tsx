function Bone({ className }: { className?: string }) {
  return <div className={`rounded-xl bg-gray-100 animate-pulse ${className ?? ''}`} />
}

export default function MealPlansLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12">

      {/* Header */}
      <div className="fixed inset-x-0 top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-sm py-3">
        <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <Bone className="h-5 w-24" />
            <Bone className="h-3 w-16" />
          </div>
          <Bone className="h-9 w-28 rounded-2xl shrink-0" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-none px-4 lg:px-8 pt-20 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-100 px-4 py-4 flex items-center gap-3 animate-pulse">
            <Bone className="h-10 w-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-28" />
              <div className="flex gap-1.5">
                <Bone className="h-5 w-16 rounded-full" />
                <Bone className="h-5 w-12 rounded-full" />
              </div>
            </div>
            <Bone className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
