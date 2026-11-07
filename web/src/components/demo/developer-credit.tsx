/** Fixed presentation text: never read from editable shop/receipt preferences. */
const developerBrand = {
  label: "Developed by SalamTech",
  contact: "AbdulSalam · +92-310-3698984",
} as const;

export function DeveloperCredit({ variant = "receipt" }: { variant?: "receipt" | "sidebar" }) {
  return <div data-developer-credit className={"mt-3 text-center leading-4 " + (variant === "sidebar" ? "text-[#bdcbd9]" : "text-[#374151]")}>
    <p className={variant === "sidebar" ? "text-xs" : "text-[10px]"}>{developerBrand.label}</p>
    <p className={variant === "sidebar" ? "text-[11px] text-[#9fB2c5]" : "text-[9px]"}>{developerBrand.contact}</p>
  </div>;
}
