// Display abbreviation only. The complete immutable reference remains available for lookup.
export function shortInvoiceReference(value:string) { return /^TEST-[0-9a-f-]{36}$/i.test(value)?"TEST-"+value.slice(5,13).toUpperCase()+"..."+value.slice(-4).toUpperCase():value; }
export function InvoiceReference({value}:{value:string}) {
 const compact=shortInvoiceReference(value);
 return <details className="text-sm"><summary className="cursor-pointer whitespace-nowrap font-medium" title={value}>{compact}</summary><span className="mt-1 block break-all text-xs text-muted-foreground">Full invoice reference: {value}</span></details>;
}
