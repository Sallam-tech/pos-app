import "server-only";
export class ExpenseError extends Error{constructor(readonly code:"INVALID_INPUT"|"CONFLICT"|"NOT_FOUND"|"UNAVAILABLE"="INVALID_INPUT"){super("Expense unavailable.");this.name="ExpenseError";}}
