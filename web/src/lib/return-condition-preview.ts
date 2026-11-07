export type ReturnCondition = "" | "good" | "damaged";
export function validateReturnCondition(value: string): string | undefined {
  if (value !== "" && value !== "good" && value !== "damaged") return "Choose the condition of the returned item.";
}
export function proposedStockTreatment(value: ReturnCondition): string {
  if (value === "") return "Pending inspection. Do not add to sellable stock until condition and an authorized return are recorded.";
  return value === "good" ? "May be returned to available stock only after an authorized, successfully recorded return." : "Do not return to available stock.";
}
