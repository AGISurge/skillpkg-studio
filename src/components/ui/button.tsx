import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--brand-muted)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border aria-invalid:border-[var(--danger-text)] aria-invalid:ring-2 aria-invalid:ring-[var(--danger-bg)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--brand)] text-[var(--primary-text)] hover:bg-[var(--brand-hover)]",
        outline:
          "border border-[var(--border-subtle)] bg-[var(--surface-bg)] hover:bg-[var(--surface-bg-hover)] hover:text-[var(--app-text-strong)] aria-expanded:bg-[var(--surface-bg-hover)] aria-expanded:text-[var(--app-text-strong)]",
        secondary:
          "bg-[var(--surface-bg-strong)] text-[var(--app-text)] hover:bg-[var(--surface-bg-hover)] aria-expanded:bg-[var(--surface-bg-hover)] aria-expanded:text-[var(--app-text-strong)]",
        ghost:
          "bg-transparent hover:bg-[var(--surface-bg-hover)] hover:text-[var(--app-text-strong)] aria-expanded:bg-[var(--surface-bg-hover)] aria-expanded:text-[var(--app-text-strong)]",
        destructive:
          "bg-[var(--danger-bg)] text-[var(--danger-text)] hover:bg-[rgba(255,103,103,0.24)] focus-visible:border-[var(--danger-text)] focus-visible:ring-[var(--danger-bg)]",
        link: "text-[var(--brand-link)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 rounded-[10px] px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[12px] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[10px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[12px]",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
