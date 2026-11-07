import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AddProductPreview } from "@/components/admin/add-product-preview";

function validProduct() {
  for (const [label, value] of [["Product Name *", "Test product"], ["Buying Price (Rs.) *", "100"], ["Stock Quantity *", "1"], ["Low Stock Alert *", "0"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
it("opens collapsed optional details and focuses an invalid code without changing its value", () => {
  render(<AddProductPreview />);
  validProduct();
  const code = screen.getByLabelText("Product Code (Optional)");
  const details = code.closest("details")!;
  expect(details.open).toBe(false);
  fireEvent.change(code, { target: { value: "bad code" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(details.open).toBe(true);
  expect(code).toHaveFocus();
  expect(code).toHaveValue("bad code");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.change(code, { target: { value: "" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("status")).toHaveTextContent("No product or stock was saved");
});
it("keeps required errors visible and focuses them before optional code errors", () => {
  render(<AddProductPreview />);
  for (const input of document.querySelectorAll("input[required]")) expect(input.closest("details")).toBeNull();
  const code = screen.getByLabelText("Product Code (Optional)");
  fireEvent.change(code, { target: { value: "bad code" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByLabelText("Product Name *")).toHaveFocus();
  expect(screen.getByText("Enter a valid product name.")).toBeVisible();
  expect(code.closest("details")!.open).toBe(false);
});
