import { ConstructionIcon } from "lucide-react"

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <ConstructionIcon className="size-10 text-muted-foreground" />
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hasn't been built yet.
      </p>
    </div>
  )
}
