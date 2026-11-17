// Ninety inclusive Karachi business dates; filtering never changes retained records.
const businessDate = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"});
export function recentSalesRange(at = Date.now()): {from:string;to:string} {
 const to=businessDate.format(new Date(at)),[year,month,day]=to.split("-").map(Number);
 const start=new Date(Date.UTC(year,month-1,day));start.setUTCDate(start.getUTCDate()-89);
 return {from:start.toISOString().slice(0,10),to};
}