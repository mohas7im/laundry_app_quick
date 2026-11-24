// shadcn "login-02" block layout. The brand panel takes the place of the block's image.
import type { CSSProperties } from "react"

import { APP_NAME } from "@/config/navigation"
import { LoginForm } from "../components/login-form"

/**
 * Claim tags on the conveyor rail, in order-lifecycle order (left → right).
 * Tag colour = status, the way shops colour-code their tickets.
 */
const RAIL_TAGS = [
  { number: "4821", item: "Kandura × 3", status: "Cleaning", color: "bg-tag-yellow", tilt: "-3deg", drop: "26px", delay: "0.15s" },
  { number: "4818", item: "Suit, 2 piece", status: "Ready", color: "bg-tag-mint", tilt: "2deg", drop: "40px", delay: "0.3s" },
  { number: "4807", item: "Duvet, large", status: "Collected", color: "bg-tag-white", tilt: "-1.5deg", drop: "30px", delay: "0.45s" },
]

/** Navy panel (twill texture) with garment tags hanging on a conveyor rail. Decorative. */
function BrandPanel() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden flex-col justify-center gap-20 overflow-hidden bg-night bg-[radial-gradient(120%_80%_at_0%_0%,rgb(28_61_147/0.55),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgb(18_39_92/0.9),transparent_70%),repeating-linear-gradient(-45deg,rgb(255_255_255/0.035)_0_1px,transparent_1px_5px)] p-10 lg:flex xl:p-14"
    >
      <div className="relative mx-auto flex w-full max-w-lg justify-around px-4">
        {/* the rail */}
        <div className="absolute inset-x-0 top-0 h-1 rounded-full bg-linear-to-b from-white/55 to-white/20 shadow-[0_2px_6px_rgb(0_0_0/0.35)]" />

        {RAIL_TAGS.map((tag) => (
          // outer: drops in once · inner: sways around its tilt (motion-safe only)
          <div key={tag.number} className="motion-safe:animate-tag-drop" style={{ animationDelay: tag.delay }}>
            <div
              className="flex origin-top rotate-(--tilt) flex-col items-center drop-shadow-[0_10px_14px_rgb(0_0_0/0.35)] motion-safe:animate-tag-sway"
              style={{ "--tilt": tag.tilt } as CSSProperties}
            >
              <div className="w-[1.5px] bg-white/60" style={{ height: tag.drop }} />
              <div
                className={`relative w-37 rounded-b-md px-3.5 pt-5.5 pb-3 text-ink [clip-path:polygon(16%_0,84%_0,100%_12%,100%_100%,0_100%,0_12%)] ${tag.color}`}
              >
                <span className="absolute top-2 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-night shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]" />
                <div className="text-[1.35rem] leading-none font-semibold tracking-tight tabular-nums">{tag.number}</div>
                <div className="mt-1.5 text-[0.78rem] leading-tight font-medium">{tag.item}</div>
                <div className="mt-3 border-t-[1.5px] border-dashed border-ink/35 pt-2 text-[0.62rem] font-semibold tracking-[0.12em] uppercase">
                  {tag.status}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="max-w-xl text-4xl leading-tight font-semibold tracking-tight text-white">
          Every garment,
          <br />
          <span className="text-white/65">tagged and tracked.</span>
        </p>
        <p className="mt-4 max-w-md leading-relaxed text-white/70">
          Take in orders at the counter, follow them through cleaning, and hand them back on time — in every
          branch.
        </p>
      </div>
    </div>
  )
}

export function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <BrandPanel />
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-2 font-medium">
            <img src="/comfort-logo.png" alt={APP_NAME} className="h-14 w-auto" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  )
}
