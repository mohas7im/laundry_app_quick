import { useState } from "react"
import { ChevronDownIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { MasterOption, PieceNote, PieceTag } from "../types"

export const emptyPiece = (): PieceNote => ({ colours: [], damage: [], stains: [], note: "" })

export const isEmptyPiece = (p: PieceNote) => !p.colours.length && !p.damage.length && !p.stains.length && !p.note.trim()

const TAGS: { key: PieceTag; label: string }[] = [
  { key: "colours", label: "Colour" },
  { key: "damage", label: "Damage" },
  { key: "stains", label: "Stains" },
]

/** "Navy, Button missing, note" — one piece on one line. */
export function pieceSummary(p: PieceNote) {
  return [...p.colours, ...p.damage, ...p.stains, p.note.trim()].filter(Boolean).join(", ")
}

/**
 * Tag each piece of a line: colours, damage, stains and a note (build pack: item notes).
 * "Copy down" repeats a piece's tags on the next one (a pair of navy kanduras).
 */
export function PieceNotesDialog({
  title,
  count,
  pieces,
  tags,
  onSave,
  onClose,
}: {
  /** e.g. "Kandura · Wash & Iron"; null = closed. */
  title: string | null
  /** How many pieces the line has. */
  count: number
  pieces: PieceNote[]
  tags: Record<PieceTag, MasterOption[]>
  onSave: (pieces: PieceNote[]) => void
  onClose: () => void
}) {
  return (
    <Dialog open={title !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {title !== null && (
          <PieceForm title={title} count={count} pieces={pieces} tags={tags} onSave={onSave} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PieceForm({
  title,
  count,
  pieces: initial,
  tags,
  onSave,
  onClose,
}: {
  title: string
  count: number
  pieces: PieceNote[]
  tags: Record<PieceTag, MasterOption[]>
  onSave: (pieces: PieceNote[]) => void
  onClose: () => void
}) {
  const [pieces, setPieces] = useState<PieceNote[]>(() =>
    Array.from({ length: count }, (_, i) => initial[i] ?? emptyPiece()),
  )

  const update = (index: number, patch: Partial<PieceNote>) =>
    setPieces((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)))

  const toggle = (index: number, tag: PieceTag, name: string, on: boolean) =>
    update(index, { [tag]: on ? [...pieces[index]![tag], name] : pieces[index]![tag].filter((n) => n !== name) })

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Item notes</DialogTitle>
        <DialogDescription>
          {title} · {count} {count === 1 ? "piece" : "pieces"}. Note colours, damage and stains so the customer
          sees what was handed in.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        {pieces.map((piece, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[3rem_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)_auto] sm:items-center">
            <span className="text-sm font-medium tabular-nums">#{index + 1}</span>
            {TAGS.map(({ key, label }) => (
              <DropdownMenu key={key}>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" className="min-w-0 justify-between font-normal" />}
                >
                  <span className={`truncate ${piece[key].length ? "" : "text-muted-foreground"}`}>
                    {piece[key].length ? piece[key].join(", ") : label}
                  </span>
                  <ChevronDownIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 min-w-48 overflow-y-auto">
                  {tags[key].length ? (
                    tags[key].map((t) => (
                      <DropdownMenuCheckboxItem
                        key={t.code}
                        checked={piece[key].includes(t.name)}
                        onCheckedChange={(on) => toggle(index, key, t.name, on)}
                      >
                        {t.name}
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <p className="p-2 text-xs text-muted-foreground">Add values under Common Masters.</p>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
            <Input
              className="h-8"
              placeholder="Note"
              aria-label={`Piece ${index + 1} note`}
              maxLength={200}
              value={piece.note}
              onChange={(e) => update(index, { note: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Copy piece ${index + 1} to the next piece`}
              title="Copy to the next piece"
              disabled={index === pieces.length - 1}
              onClick={() => setPieces((list) => list.map((p, i) => (i === index + 1 ? { ...piece } : p)))}
            >
              <CopyIcon />
            </Button>
          </div>
        ))}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => {
            const list = [...pieces]
            while (list.length && isEmptyPiece(list[list.length - 1]!)) list.pop()
            onSave(list)
          }}
        >
          Save notes
        </Button>
      </DialogFooter>
    </div>
  )
}
