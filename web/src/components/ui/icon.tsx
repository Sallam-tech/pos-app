import type { SVGProps } from "react";

export type IconName = "store" | "menu" | "close" | "dashboard" | "box" | "layers" | "sales" | "chart" | "arrow" | "refresh" | "check" | "alert" | "monitor";
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths = {
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
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
