"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-11 items-center justify-center gap-2 rounded-md text-base font-semibold leading-5 transition-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] active:bg-primary",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
        outline: "border border-input bg-surface hover:bg-accent active:bg-muted/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-muted/80",
        link: "text-primary underline underline-offset-4 hover:no-underline active:underline",
      },
      size: {
        default: "min-h-12 px-4 py-2",
        sm: "min-h-11 px-3 py-2 text-sm",
        lg: "min-h-14 px-6 py-3 text-base",
        icon: "size-12 shrink-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, disabled, loading = false, children, onClick, onKeyDown, type, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    const unavailable = disabled || loading;
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        type={asChild ? undefined : (type ?? "button")}
        disabled={asChild ? undefined : unavailable}
        aria-disabled={unavailable || undefined}
        aria-busy={loading || undefined}
        onClick={(event) => {
          if (unavailable) { event.preventDefault(); event.stopPropagation(); return; }
          onClick?.(event);
        }}
        onKeyDown={(event) => {
          if (unavailable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); return; }
          onKeyDown?.(event);
        }}
        {...props}
        tabIndex={unavailable && asChild ? -1 : props.tabIndex}
      >
        {asChild ? children : <>{loading && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}{children}</>}
      </Component>
    );
  },
);
Button.displayName = "Button";
export { Button, buttonVariants };
