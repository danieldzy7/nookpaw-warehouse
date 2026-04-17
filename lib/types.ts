export const BAGS_PER_CASE = 6;
export const DEFAULT_REORDER_POINT = 12;
export const MOVEMENTS_PAGE_SIZE = 20;

export type LitterCategory = "tofu" | "tapioca";

export const MOVEMENT_TYPES = ["RECEIPT", "SHIPMENT", "ADJUSTMENT"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const RECEIPT_REASONS = ["PO", "RETURN", "OTHER"] as const;
export const SHIPMENT_REASONS = ["SALE", "DAMAGE", "OTHER"] as const;
export const ADJUSTMENT_REASONS = ["COUNT", "DAMAGE", "OTHER"] as const;

export type ReasonCode =
  | (typeof RECEIPT_REASONS)[number]
  | (typeof SHIPMENT_REASONS)[number]
  | (typeof ADJUSTMENT_REASONS)[number]
  | "REVERT";

export type Unit = "case" | "bag";
export type Direction = "in" | "out";

export type Product = {
  sku: string;
  name: string;
  category: LitterCategory;
  packageSize: { value: number; unit: "kg" };
  uom: { base: "bag"; case: { factor: number } };
  reorderPoint: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductWithStock = Product & {
  onHandBags: number;
  lastMovementAt: string | null;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
};

export type Movement = {
  _id: string;
  sku: string;
  productName: string;
  type: MovementType;
  reasonCode: ReasonCode;
  unit: Unit;
  quantity: number;
  bagsDelta: number;
  bagsBefore: number;
  bagsAfter: number;
  reference: string | null;
  note: string | null;
  actor: string;
  reverted: boolean;
  revertedBy: string | null;
  revertsMovementId: string | null;
  createdAt: string;
};

export type CreateMovementInput = {
  sku: string;
  type: MovementType;
  direction?: Direction;
  unit: Unit;
  quantity: number;
  reasonCode: ReasonCode;
  reference?: string | null;
  note?: string | null;
};

export type Kpis = {
  skuCount: number;
  lowStockCount: number;
  shippedBagsToday: number;
};

export function reasonsForType(type: MovementType): readonly ReasonCode[] {
  switch (type) {
    case "RECEIPT":
      return RECEIPT_REASONS;
    case "SHIPMENT":
      return SHIPMENT_REASONS;
    case "ADJUSTMENT":
      return ADJUSTMENT_REASONS;
  }
}

export function formatCasesBags(bags: number, perCase = BAGS_PER_CASE) {
  const cases = Math.floor(bags / perCase);
  const loose = bags % perCase;
  return { cases, loose };
}
