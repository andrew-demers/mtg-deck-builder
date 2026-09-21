import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type ButtonVariant = "primary" | "secondary";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:shadow hover:opacity-90",
  secondary: "border hover:bg-primary/5",
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
      className={`rounded transition-shadow disabled:opacity-50 disabled:shadow-none ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
}

export function LinkButton({ variant = "primary", className = "", ...props }: LinkButtonProps) {
  return (
    <Link className={`rounded transition-shadow ${variantClasses[variant]} ${className}`} {...props} />
  );
}
