import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils" // Assuming based on typical setup, or I will use clsx/tailwind-merge directly if utils/cn doesn't exist

// CLSX/Tailwind Merge helper if utils/cn is missing
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn1(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// --- BUTTON ---
const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-slate-900 text-slate-50 hover:bg-slate-900/90",
                destructive: "bg-red-500 text-slate-50 hover:bg-red-500/90",
                outline: "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900",
                secondary: "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
                ghost: "hover:bg-slate-100 hover:text-slate-900",
                link: "text-slate-900 underline-offset-4 hover:underline",
                success: "bg-green-600 text-white hover:bg-green-700",
                warning: "bg-yellow-500 text-white hover:bg-yellow-600",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-11 rounded-md px-8",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        return (
            <button
                className={cn1(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

// --- INPUT ---
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn1(
                    "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

// --- TEXTAREA ---
const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn1(
                    "flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

// --- BADGE ---
const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
    {
        variants: {
            variant: {
                default: "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80",
                secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80",
                destructive: "border-transparent bg-red-500 text-slate-50 hover:bg-red-500/80",
                outline: "text-slate-950",
                success: "border-transparent bg-green-500 text-white hover:bg-green-500/80",
                warning: "border-transparent bg-yellow-500 text-white hover:bg-yellow-500/80",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn1(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Button, Input, Textarea, Badge }
