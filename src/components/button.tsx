import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type ButtonVariant = "primary" | "secondary";

const baseClasses =
  "rounded-full border-2 font-bold uppercase tracking-wide transition-[filter,transform] " +
  "hover:[filter:drop-shadow(0_0_8px_var(--primary))] active:translate-y-px disabled:opacity-50 disabled:hover:[filter:none]";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground",
  secondary: "border-current bg-transparent text-foreground",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export default function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
}

export function LinkButton({ variant = "primary", className = "", ...props }: LinkButtonProps) {
  return <Link className={`${baseClasses} ${variantClasses[variant]} inline-block ${className}`} {...props} />;
}
