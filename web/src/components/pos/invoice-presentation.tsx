import { formatPreviewPKR } from "@/lib/pos-preview";
import "./sale-preview.css";

/** Shared paper presentation only; callers provide current draft or recorded snapshots. */
export function InvoicePaperHeader({ shopName, address = "", phone = "", notice = "SAMPLE / DEMO — NOT SAVED" }: {
  shopName: string; address?: string; phone?: string; notice?: string;
}) {
  return <header className="text-center">
    <p className="break-words text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{shopName.trim()}</p>
    {address.trim() && <p className="mt-1 whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">{address.trim()}</p>}
    {phone && <p className="mt-1 break-words text-xs">Phone: {phone}</p>}
    <h3 className="mt-3 border-t border-black pt-3 text-sm font-bold tracking-[0.16em]">SALES INVOICE</h3>
    <p className="mt-1 text-[10px] font-semibold">{notice}</p>
  </header>;
}
type PaperItem = { product: { name: string }; quantity: string | number; unitPrice: string | null; total: string | null; discountPercent?: string; discountAmount?: string };
export function InvoiceItemsTable({ items }: { items: readonly PaperItem[] }) {
  return <table className="receipt-items invoice-item-table"><caption className="sr-only">Sample invoice items</caption>
    <colgroup><col style={{ width: "6%" }} /><col style={{ width: "38%" }} /><col style={{ width: "12%" }} /><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /></colgroup>
    <thead><tr><th scope="col">#</th><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Rate (Rs.)</th><th scope="col">Amount (Rs.)</th></tr></thead>
    <tbody>{items.map((item, index) => <tr key={index}>
      <td>{index + 1}</td><th scope="row">{item.product.name}{item.discountAmount && item.discountAmount !== "0.00" && <span className="mt-1 block text-[10px] font-normal leading-4">Discount {item.discountPercent}% · {formatPreviewPKR(item.discountAmount)} off</span>}</th><td className="numeric">{item.quantity}</td>
      <td className="numeric">{item.unitPrice === null ? "Not recorded" : formatPreviewPKR(item.unitPrice).slice(4)}</td><td className="numeric">{item.total === null ? "Unavailable" : formatPreviewPKR(item.total).slice(4)}</td>
    </tr>)}</tbody>
  </table>;
}
