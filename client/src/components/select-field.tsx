import { cn } from "cn"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type SelectOption = {
  /** null = the "nothing chosen" option (e.g. "None (top level)"). */
  value: string | null
  label: React.ReactNode
  disabled?: boolean
}

type SelectFieldProps = {
  id?: string
  value: string | null
  onValueChange: (value: string | null) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  size?: "sm" | "default"
  className?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
}

/**
 * A single-choice dropdown built from shadcn's Select parts.
 * `options` is also passed as Base UI `items`, so the trigger shows the chosen label.
 */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  size,
  className,
  ...aria
}: SelectFieldProps) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => onValueChange((next as string | null) ?? null)}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      {/* open below the field like a dropdown, instead of on top of it */}
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value ?? "__none__"} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
