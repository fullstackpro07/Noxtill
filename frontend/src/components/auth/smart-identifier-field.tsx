import { Mail, Phone } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";

const PHONE_START = /^[+\d]/;

export function looksLikePhone(value: string): boolean {
  return PHONE_START.test(value.trim());
}

/**
 * One field, not two — detects email vs. phone as the user types (FE-004)
 * and swaps the leading icon + keyboard mode to match, rather than making
 * the owner pick a field type up front.
 */
export function SmartIdentifierField({ value, ...props }: InputProps) {
  const asString = typeof value === "string" ? value : "";
  const isPhone = looksLikePhone(asString);

  return (
    <Input
      value={value}
      label="Email or phone number"
      placeholder="you@business.com or +1 555 000 0000"
      inputMode={isPhone ? "tel" : "email"}
      leadingSlot={
        isPhone ? <Phone className="h-4 w-4" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />
      }
      {...props}
    />
  );
}
