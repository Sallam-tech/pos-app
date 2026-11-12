import "server-only";
// Owner-approved exact programs only. This is not a general trigger grammar.
const TRIGGERS = [
  {
    "file": "0020_inventory_operations_insert_guard.sql",
    "name": "inventory_operations_insert_guard",
    "table": "inventory_operations",
    "checksum": "ddeb839845f8c46b14f9f15c1a314a8c3987faf846714b26739a6918d4049712"
  },
  {
    "file": "0021_inventory_operations_no_update.sql",
    "name": "inventory_operations_no_update",
    "table": "inventory_operations",
    "checksum": "4be3836167978099dfa04e040ea275b67980270ed45e21590b8e4f2a4d0966ba"
  },
  {
    "file": "0022_inventory_operations_no_delete.sql",
    "name": "inventory_operations_no_delete",
    "table": "inventory_operations",
    "checksum": "1e2827974e16b5a4f3a941eca1c640baf322dca4593b4498ef7fa1f01c8674af"
  },
  {
    "file": "0023_stock_movements_insert_guard.sql",
    "name": "stock_movements_insert_guard",
    "table": "stock_movements",
    "checksum": "96cb7ecaf4acd667e3d415b89335ca1ac4a690a004a106e224c1d8b8c5d6c708"
  },
  {
    "file": "0024_stock_movements_no_update.sql",
    "name": "stock_movements_no_update",
    "table": "stock_movements",
    "checksum": "f20a6482b05eb03cd3a1685fc7f938ae3f5f27bbd675c6f173ccef170099e962"
  },
  {
    "file": "0025_stock_movements_no_delete.sql",
    "name": "stock_movements_no_delete",
    "table": "stock_movements",
    "checksum": "d00ec6759d016b0283b5fcac9bc69e3a74d5755f204da394135b559898331f7d"
  },
  {
    "file": "0026_product_events_insert_guard.sql",
    "name": "product_events_insert_guard",
    "table": "product_events",
    "checksum": "5eed62f283882aecf6e71e69fafbcd05362def1c625536bcb1f45df2c2870a2b"
  },
  {
    "file": "0027_product_events_no_update.sql",
    "name": "product_events_no_update",
    "table": "product_events",
    "checksum": "cee03ce1ee3220f9e22353178a467bb413f01cc31cf676e599eccd34c883cbd0"
  },
  {
    "file": "0028_product_events_no_delete.sql",
    "name": "product_events_no_delete",
    "table": "product_events",
    "checksum": "cee10f604748ce874ebf45b354873d0174b607ce43162f0d259d5b0ab9dfe8af"
  },
  {
    "file": "0029_inventory_cancellations_insert_guard.sql",
    "name": "inventory_cancellations_insert_guard",
    "table": "inventory_cancellations",
    "checksum": "45eb0810a1e366c79df955cf5813fe19e11c2e9e254a5e9d77afe3c8a1aadde2"
  },
  {
    "file": "0030_inventory_cancellations_no_update.sql",
    "name": "inventory_cancellations_no_update",
    "table": "inventory_cancellations",
    "checksum": "2f7578f54cfaea45d80db37879a134a93d7e79ff83655466031a39934704d352"
  },
  {
    "file": "0031_inventory_cancellations_no_delete.sql",
    "name": "inventory_cancellations_no_delete",
    "table": "inventory_cancellations",
    "checksum": "3944328128e76f1a5c994f772fd16e23f9d2d70d7d779fe79c41fbed6eff75e5"
  },
  {
    "file": "0032_inventory_operations_positive_rowid.sql",
    "name": "inventory_operations_positive_rowid",
    "table": "inventory_operations",
    "checksum": "f006eda0e0779e0d800896f542c9c9e632084d78aac28675f86a0e148d01ab7b"
  },
  {
    "file": "0033_stock_movements_positive_rowid.sql",
    "name": "stock_movements_positive_rowid",
    "table": "stock_movements",
    "checksum": "db4126398b8a338b55db6b956c335427ee334214af1bf5bae9c746f05a577698"
  },
  {
    "file": "0034_product_events_positive_rowid.sql",
    "name": "product_events_positive_rowid",
    "table": "product_events",
    "checksum": "c5dd2cca56d55a32e058388e5e3df5c78d4e09b8c4156848e47f5797ae6212ff"
  },
  {
    "file": "0035_inventory_cancellations_positive_rowid.sql",
    "name": "inventory_cancellations_positive_rowid",
    "table": "inventory_cancellations",
    "checksum": "f9dd35cb53d08c7d12a0ef2c58e0b64ec017b02b59277a32c1656fe59a7031df"
  }
] as const;
export const immutableInventoryTables = ["inventory_operations", "stock_movements", "product_events", "inventory_cancellations"] as const;
export function reviewedInventoryTrigger(file: string, checksum: string) {
 return TRIGGERS.find(t => t.file === file && t.checksum === checksum);
}
export const storedTriggerSql = (sql: string) => sql.trim().replace(/;$/, "");
