import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordSaleForm } from "@/components/pos/record-sale-form";

function chooseProduct(query = "dia", name = "Diapers") {
  const input = screen.getByRole("combobox", { name: "Product" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  fireEvent.click(screen.getByRole("option", { name }));
  return input;
}

describe("Record Sale preview", () => {
  it("reports required fields and focuses the first invalid selection", () => {
    render(<RecordSaleForm />);
    fireEvent.click(screen.getByRole("button", { name: "Record Sale" }));
    expect(screen.getByText("Choose a product from the search results.")).toBeVisible();
    expect(screen.getByText("Enter a selling price in PKR.")).toBeVisible();
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-describedby", "sale-product-error");
  });

  it("filters case-insensitively, shows empty results and selects by keyboard", () => {
    render(<RecordSaleForm />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(screen.getByText("No matching mock products. Try another name.")).toBeVisible();
    fireEvent.change(input, { target: { value: "MILK" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Milk Powder");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: /simulation complete/i })).not.toBeInTheDocument();
  });

  it("closes the list with Escape without losing typed text", () => {
    render(<RecordSaleForm />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "baby" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("baby");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("validates edited selections and numeric input instead of treating text as a product", () => {
    render(<RecordSaleForm />);
    const input = chooseProduct();
    fireEvent.change(input, { target: { value: "Diaper" } });
    fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Selling price per unit (PKR)"), { target: { value: "-1" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByText("Choose a product from the search results.")).toBeVisible();
    expect(screen.getByText("Enter a quantity greater than zero.")).toBeVisible();
    expect(screen.getByLabelText("Selling price per unit (PKR)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("sale-total")).toHaveTextContent("—");
  });

  it("calculates, steps, confirms explicitly as a simulation and resets with focus", () => {
    render(<RecordSaleForm />);
    chooseProduct();
    fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity by one" }));
    expect(screen.getByLabelText("Quantity", { exact: true })).toHaveValue("2.5");
    fireEvent.click(screen.getByRole("button", { name: "Decrease quantity by one" }));
    fireEvent.change(screen.getByLabelText("Selling price per unit (PKR)"), { target: { value: "1,200.50" } });
    expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 1,800.75");
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("heading", { name: "Sale simulation complete" })).toHaveFocus();
    expect(screen.getByText("Diapers", { exact: true })).toBeVisible();
    expect(screen.getByTestId("confirmation-quantity")).toHaveTextContent("1.5");
    expect(screen.getByTestId("confirmation-price")).toHaveTextContent("Rs. 1,200.50");
    expect(screen.getByTestId("confirmation-total")).toHaveTextContent("Rs. 1,800.75");
    expect(screen.getByRole("status")).toHaveTextContent("No sale was recorded.");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New Sale" }));
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByLabelText("Quantity", { exact: true })).toHaveValue("1");
    expect(screen.getByLabelText("Selling price per unit (PKR)")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["100.999", "0.001"])("preserves and rejects over-precise input %s, then accepts a correction", (value) => {
    render(<RecordSaleForm />);
    chooseProduct();
    fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "2" } });
    const price = screen.getByLabelText("Selling price per unit (PKR)");
    fireEvent.change(price, { target: { value } });
    expect(price).toHaveValue(value);
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(price).toHaveAttribute("aria-describedby", "sale-price-error");
    expect(screen.getByText("Enter a price with no more than 2 decimal places.")).toBeVisible();
    expect(screen.getByTestId("sale-total")).toHaveTextContent("—");
    fireEvent.submit(screen.getByRole("form"));
    expect(price).toHaveFocus();
    expect(price).toHaveValue(value);
    expect(screen.queryByRole("heading", { name: "Sale simulation complete" })).not.toBeInTheDocument();
    fireEvent.change(price, { target: { value: "1250.25" } });
    expect(price).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Enter a price with no more than 2 decimal places.")).not.toBeInTheDocument();
    expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 2,500.50");
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByTestId("confirmation-total")).toHaveTextContent("Rs. 2,500.50");
  });

  it("allows illustrative zero prices and preserves sub-paisa exact totals", () => {
    render(<RecordSaleForm />);
    chooseProduct("rice", "Rice");
    fireEvent.change(screen.getByLabelText("Quantity", { exact: true }), { target: { value: "0.125" } });
    fireEvent.change(screen.getByLabelText("Selling price per unit (PKR)"), { target: { value: "0.1" } });
    expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 0.0125");
    fireEvent.change(screen.getByLabelText("Selling price per unit (PKR)"), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByTestId("confirmation-total")).toHaveTextContent("Rs. 0.00");
  });
});

it("shows optional price guidance without changing actual price, quantity or confirmation arithmetic", () => {
  render(<RecordSaleForm />);
  chooseProduct();
  expect(screen.getByText("Suggested: Rs. 1,250.00")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Product" })).toHaveAccessibleDescription("Suggested: Rs. 1,250.00");
  const price = screen.getByLabelText("Selling price per unit (PKR)");
  const quantity = screen.getByLabelText("Quantity", { exact: true });
  expect(price).toHaveValue("");
  fireEvent.change(price, { target: { value: "1200.00" } });
  fireEvent.change(quantity, { target: { value: "2" } });
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 2,400.00");
  chooseProduct("milk", "Milk Powder");
  expect(screen.getByText("No suggested price")).toBeVisible();
  expect(price).toHaveValue("1200.00");
  expect(quantity).toHaveValue("2");
  chooseProduct();
  expect(price).toHaveValue("1200.00");
  expect(screen.queryByText(/purchase cost|profit|margin|markup|remaining stock/i)).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByTestId("confirmation-price")).toHaveTextContent("Rs. 1,200.00");
  expect(screen.getByTestId("confirmation-total")).toHaveTextContent("Rs. 2,400.00");
  fireEvent.click(screen.getByRole("button", { name: "New Sale" }));
  expect(screen.getByRole("combobox")).toHaveFocus();
  expect(screen.getByRole("combobox")).toHaveValue("");
  expect(screen.getByLabelText("Selling price per unit (PKR)")).toHaveValue("");
  expect(screen.queryByText("Suggested: Rs. 1,250.00")).not.toBeInTheDocument();
});
