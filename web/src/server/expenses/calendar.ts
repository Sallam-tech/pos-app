import "server-only";
import {ExpenseError} from "./errors";
const karachiDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"});
export const expenseDay=(n=Date.now())=>karachiDate.format(new Date(n));
export function calendar(v:unknown):string{if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<"2000-01-01"||!Number.isFinite(Date.parse(v+"T00:00:00Z"))||new Date(v+"T00:00:00Z").toISOString().slice(0,10)!==v)throw new ExpenseError();return v;}
