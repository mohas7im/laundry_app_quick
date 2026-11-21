import { EyeIcon, PencilIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** View / Edit / Delete icons at the end of a table row. Omit a handler to hide that icon. */
export function RowActionButtons({
  label,
  onView,
  onEdit,
  onDelete,
}: {
  /** What the row is, for screen readers: "Edit {label}". */
  label: string
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex justify-end gap-0.5">
      {onView && <IconAction label={`View ${label}`} onClick={onView} icon={<EyeIcon />} />}
      {onEdit && <IconAction label={`Edit ${label}`} onClick={onEdit} icon={<PencilIcon />} />}
      {onDelete && (
        <IconAction label={`Delete ${label}`} onClick={onDelete} icon={<Trash2Icon />} destructive />
      )}
    </div>
  )
}

function IconAction({
  label,
  icon,
  onClick,
  destructive,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={destructive ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : undefined}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
