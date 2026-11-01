import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";

describe("Admin dashboard overview preview", () => {
  it("associates exactly five labeled summary groups with visible mock-data context", () => {
    render(<DashboardPage />);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    expect(overview).toHaveAccessibleDescription("Mock data only. These figures are examples, not live shop records.");
    const groups = within(overview).getAllByRole("group");
    expect(groups).toHaveLength(5);
    for (const group of groups) {
      expect(group).toHaveAccessibleName();
      expect(group).toHaveAccessibleDescription(/Mock data only/);
      expect(within(group).getByText("Mock data", { exact: true })).toBeVisible();
    }
  });

  it("shows exact PKR examples and count values without adding business controls", () => {
    render(<DashboardPage />);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    const expected = [
      ["Total Products", "6", "6"],
      ["Available Stock", "123", "123"],
      ["Low Stock Products", "2", "2"],
      ["Today's Sales Revenue (PKR)", "25690.00", "Rs. 25,690.00"],
      ["Today's Profit (PKR)", "4860.00", "Rs. 4,860.00"],
    ];
    for (const [name, value, display] of expected) {
      const group = within(overview).getByRole("group", { name });
      expect(within(group).getByText(display, { exact: true })).toHaveAttribute("value", value);
    }
    expect(within(overview).queryByRole("button")).not.toBeInTheDocument();
    expect(within(overview).queryByRole("table")).not.toBeInTheDocument();
    expect(within(overview).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
