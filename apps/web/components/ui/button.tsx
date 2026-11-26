import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  {
    variants: {
      variant: {
        primary: "bg-ink text-canvas shadow-sm hover:bg-ink/90 active:scale-[0.98]",
        accent: "bg-accent text-white shadow-sm hover:bg-accent-strong active:scale-[0.98]",
        outline: "border border-line bg-surface text-ink hover:border-ink/25 hover:bg-surface-2 active:scale-[0.98]",
        ghost: "text-ink-soft hover:bg-surface-2 hover:text-ink active:scale-[0.98]",
        subtle: "bg-accent-soft text-accent hover:bg-accent-soft/75 active:scale-[0.98]",
        danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white active:scale-[0.98]",
        "danger-solid": "bg-danger text-white hover:opacity-90 active:scale-[0.98]",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
