"use client";

import { useState } from "react";
import { shopLogoDataUri } from "./shop-logo-data";

/**
 * Fixed client logo (AL.MADINA Medical & Traders). The shop name, address and
 * phone stay editable in Admin Settings; only the artwork is built in.
 * Decorative by default because the shop name is always shown beside it.
 */
export function ShopLogo({ className, label }: { className?: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- embedded data URI; next/image would need a server image route.
  return <img src={shopLogoDataUri} alt={label ?? ""} aria-hidden={label ? undefined : true} draggable={false}
    width={256} height={256} decoding="async" className={className} onError={() => setFailed(true)} />;
}
