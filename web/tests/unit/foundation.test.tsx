import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { Button } from "@/components/ui/button";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }),
}));

describe("single demo entry", () => {
  it("redirects the root to the existing Login without another form or authentication step", () => {
    expect(() => Home()).toThrow("redirect:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("preserves native disabled behavior in the shared button", () => {
    render(<Button disabled>Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
