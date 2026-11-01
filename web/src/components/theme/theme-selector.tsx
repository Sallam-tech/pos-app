"use client";

import { useId } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { Select } from "@/components/ui/select";
import { parseTheme } from "@/lib/theme";

export function ThemeSelector() {
  const id = useId();
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">Theme</label>
      <Select id={id} className="w-32" value={preference} onChange={(event) => setPreference(parseTheme(event.target.value))}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </Select>
    </div>
  );
}
