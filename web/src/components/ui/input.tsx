import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputStyles = "min-h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted-foreground disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputStyles, className)} {...props} />,
);
Input.displayName = "Input";
