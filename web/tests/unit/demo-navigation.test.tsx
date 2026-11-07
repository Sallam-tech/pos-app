import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoAccess, DemoExitLink } from "@/components/demo/demo-navigation";

describe("isolated prototype navigation", () => {
  it("offers two honest previews without credentials, forms or an authenticated session", () => {
    render(<DemoAccess />);
    expect(screen.getByRole("navigation", { name: "Explore Demo" })).toBeVisible();
    expect(screen.getByText("Demo previews only. No sign-in or saved changes.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Preview Admin" })).toHaveAttribute("href", "/admin/dashboard");
    expect(screen.getByRole("link", { name: "Preview Salesperson" })).toHaveAttribute("href", "/pos");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("offers one return link without claiming to end a real session", () => {
    render(<DemoExitLink />);
    expect(screen.getByRole("link", { name: "Exit Demo" })).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText(/logout|signed out|session ended/i)).not.toBeInTheDocument();
  });

  it("can disable all prototype entry/return shortcuts in one isolated place", () => {
    render(<><DemoAccess enabled={false} /><DemoExitLink enabled={false} /></>);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
