import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { Button } from "@/components/ui/button";

describe("foundation smoke", () => {
  it("renders the starter page and a semantic health link", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Project foundation" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Check server health" })).toHaveAttribute(
      "href",
      "/api/health",
    );
  });

  it("preserves native disabled behavior in the shared button", () => {
    render(<Button disabled>Continue</Button>);

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
