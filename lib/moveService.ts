import { ObjectId } from "mongodb";
import {
  ensureReady,
  movements,
  products,
  stock,
  withTransaction,
  type MovementDoc,
  type ProductDoc,
} from "@/lib/repo";
import {
  ADJUSTMENT_REASONS,
  CreateMovementInput,
  Direction,
  Movement,
  MovementType,
  RECEIPT_REASONS,
  ReasonCode,
  SHIPMENT_REASONS,
  Unit,
  reasonsForType,
} from "@/lib/types";

export class MoveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function toClientMovement(m: MovementDoc): Movement {
  return {
    _id: m._id.toHexString(),
    sku: m.sku,
    productName: m.productName,
    type: m.type,
    reasonCode: m.reasonCode,
    unit: m.unit,
    quantity: m.quantity,
    bagsDelta: m.bagsDelta,
    bagsBefore: m.bagsBefore,
    bagsAfter: m.bagsAfter,
    reference: m.reference,
    note: m.note,
    actor: m.actor,
    reverted: m.reverted,
    revertedBy: m.revertedBy ? m.revertedBy.toHexString() : null,
    revertsMovementId: m.revertsMovementId
      ? m.revertsMovementId.toHexString()
      : null,
    createdAt: m.createdAt.toISOString(),
  };
}

function validateInput(input: CreateMovementInput): {
  type: MovementType;
  direction: Direction;
  unit: Unit;
  quantity: number;
  reasonCode: ReasonCode;
} {
  const type = input.type;
  if (!["RECEIPT", "SHIPMENT", "ADJUSTMENT"].includes(type as string)) {
    throw new MoveError("Invalid type");
  }
  const unit: Unit =
    input.unit === "case" || input.unit === "bag" ? input.unit : ("bag" as Unit);
  if (unit !== "case" && unit !== "bag") {
    throw new MoveError("Invalid unit");
  }
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new MoveError("Quantity must be a positive integer");
  }

  let direction: Direction;
  if (type === "RECEIPT") direction = "in";
  else if (type === "SHIPMENT") direction = "out";
  else {
    if (input.direction !== "in" && input.direction !== "out") {
      throw new MoveError("ADJUSTMENT requires direction in|out");
    }
    direction = input.direction;
  }

  const allowed = reasonsForType(type);
  if (!allowed.includes(input.reasonCode as (typeof allowed)[number])) {
    throw new MoveError(
      `Invalid reasonCode for ${type}. Allowed: ${allowed.join(", ")}`
    );
  }

  return {
    type,
    direction,
    unit,
    quantity,
    reasonCode: input.reasonCode,
  };
}

export async function createMovement(
  input: CreateMovementInput
): Promise<Movement> {
  const { db } = await ensureReady();
  const { type, direction, unit, quantity, reasonCode } = validateInput(input);

  const product = await products(db).findOne({ sku: input.sku, active: true });
  if (!product) throw new MoveError(`SKU not found: ${input.sku}`, 404);

  const bagsPerCase = product.uom.case.factor;
  const bagsAbs = unit === "case" ? quantity * bagsPerCase : quantity;
  const bagsDelta = direction === "in" ? bagsAbs : -bagsAbs;

  return withTransaction(async (session) => {
    const s = await stock(db).findOne(
      { productId: product._id },
      { session }
    );
    const bagsBefore = s?.onHandBags ?? 0;
    const bagsAfter = bagsBefore + bagsDelta;
    if (bagsAfter < 0) {
      throw new MoveError(
        `库存不足：当前 ${bagsBefore} 包，无法${direction === "out" ? "出库" : "减少"} ${bagsAbs} 包`
      );
    }

    const now = new Date();
    const movementId = new ObjectId();
    const doc: MovementDoc = {
      _id: movementId,
      productId: product._id,
      sku: product.sku,
      productName: product.name,
      type,
      reasonCode,
      unit,
      quantity,
      bagsDelta,
      bagsBefore,
      bagsAfter,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      actor: "system",
      reverted: false,
      revertedBy: null,
      revertsMovementId: null,
      createdAt: now,
    };

    await movements(db).insertOne(doc, { session });

    await stock(db).updateOne(
      { productId: product._id },
      {
        $set: {
          onHandBags: bagsAfter,
          lastMovementAt: now,
          updatedAt: now,
        },
        $setOnInsert: { productId: product._id },
      },
      { session, upsert: true }
    );

    return toClientMovement(doc);
  });
}

export async function revertMovement(movementId: string): Promise<Movement> {
  if (!ObjectId.isValid(movementId)) {
    throw new MoveError("Invalid movement id");
  }
  const { db } = await ensureReady();
  const id = new ObjectId(movementId);

  return withTransaction(async (session) => {
    const m = await movements(db).findOne({ _id: id }, { session });
    if (!m) throw new MoveError("Movement not found", 404);
    if (m.reverted) throw new MoveError("Movement already reverted");
    if (m.revertsMovementId)
      throw new MoveError("Cannot revert a revert movement");

    const product = await products(db).findOne(
      { _id: m.productId },
      { session }
    );
    if (!product) throw new MoveError("Product not found", 404);

    const s = await stock(db).findOne(
      { productId: m.productId },
      { session }
    );
    const bagsBefore = s?.onHandBags ?? 0;
    const reverseDelta = -m.bagsDelta;
    const bagsAfter = bagsBefore + reverseDelta;
    if (bagsAfter < 0) {
      throw new MoveError(
        `无法撤销：当前 ${bagsBefore} 包，若撤销会变成 ${bagsAfter} 包`
      );
    }

    const now = new Date();
    const newId = new ObjectId();
    const reverseType: MovementType =
      m.type === "RECEIPT"
        ? "SHIPMENT"
        : m.type === "SHIPMENT"
          ? "RECEIPT"
          : "ADJUSTMENT";

    const doc: MovementDoc = {
      _id: newId,
      productId: m.productId,
      sku: m.sku,
      productName: m.productName,
      type: reverseType,
      reasonCode: "REVERT",
      unit: m.unit,
      quantity: m.quantity,
      bagsDelta: reverseDelta,
      bagsBefore,
      bagsAfter,
      reference: m.reference,
      note: `撤销 ${m._id.toHexString()}`,
      actor: "system",
      reverted: false,
      revertedBy: null,
      revertsMovementId: m._id,
      createdAt: now,
    };

    await movements(db).insertOne(doc, { session });
    await movements(db).updateOne(
      { _id: m._id },
      { $set: { reverted: true, revertedBy: newId } },
      { session }
    );
    await stock(db).updateOne(
      { productId: m.productId },
      {
        $set: { onHandBags: bagsAfter, lastMovementAt: now, updatedAt: now },
      },
      { session }
    );

    return toClientMovement(doc);
  });
}

export type ListFilters = {
  sku?: string | null;
  type?: MovementType | null;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
};

export async function listMovements(filters: ListFilters) {
  const { db } = await ensureReady();
  const q: Record<string, unknown> = {};
  if (filters.sku) q.sku = filters.sku;
  if (filters.type) q.type = filters.type;
  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    q.createdAt = range;
  }
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const total = await movements(db).countDocuments(q);
  const items = await movements(db)
    .find(q)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();
  return {
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: items.map(toClientMovement),
  };
}

export const AllowedReasons = {
  RECEIPT: RECEIPT_REASONS,
  SHIPMENT: SHIPMENT_REASONS,
  ADJUSTMENT: ADJUSTMENT_REASONS,
};
export type { Product, Movement } from "@/lib/types";
export type { ProductDoc };
