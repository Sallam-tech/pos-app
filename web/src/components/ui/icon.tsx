import type { SVGProps } from "react";

export type IconName = "store" | "menu" | "close" | "dashboard" | "box" | "layers" | "sales" | "chart" | "arrow" | "refresh" | "check" | "alert" | "monitor" | "return" | "wallet" | "calendar" | "settings";
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" /></>,
    settings: <><path d="m10 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 1-3-2-2 1-3-3-2-3 1-2-1Z" /><circle cx="12" cy="12" r="3" /></>,
    store: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 4v5m8-5v5M8 14h8m-8 4h5" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    box: <><path d="m3 7 9-4 9 4-9 4-9-4v10l9 4 9-4V7M12 11v10" /></>,
    layers: <path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4" />,
    sales: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    chart: <path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    refresh: <path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="m12 3 10 18H2L12 3Zm0 6v5" /><path d="M12 17h.01" /></>,
    return: <path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3" />,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v11H5a3 3 0 0 1-3-3V6M21 12h-6v5h6" /><path d="M17 14.5h.01" /></>,
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
