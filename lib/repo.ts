import {
  ClientSession,
  Collection,
  Db,
  MongoClient,
  ObjectId,
} from "mongodb";
import { getDb, getMongoClient } from "@/lib/mongodb";
import {
  BAGS_PER_CASE,
  DEFAULT_REORDER_POINT,
  LitterCategory,
  MOVEMENT_TYPES,
  MovementType,
  ProductWithStock,
  ReasonCode,
  Unit,
} from "@/lib/types";

export type ProductDoc = {
  _id: ObjectId;
  sku: string;
  name: string;
  category: LitterCategory;
  packageSize: { value: number; unit: "kg" };
  uom: { base: "bag"; case: { factor: number } };
  reorderPoint: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StockDoc = {
  _id: ObjectId;
  productId: ObjectId;
  onHandBags: number;
  lastMovementAt: Date | null;
  updatedAt: Date;
};

export type MovementDoc = {
  _id: ObjectId;
  productId: ObjectId;
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
  revertedBy: ObjectId | null;
  revertsMovementId: ObjectId | null;
  createdAt: Date;
};

export function products(db: Db): Collection<ProductDoc> {
  return db.collection<ProductDoc>("products");
}
export function stock(db: Db): Collection<StockDoc> {
  return db.collection<StockDoc>("stock");
}
export function movements(db: Db): Collection<MovementDoc> {
  return db.collection<MovementDoc>("movements");
}

const SEED_PRODUCTS: Omit<
  ProductDoc,
  "_id" | "createdAt" | "updatedAt"
>[] = [
  {
    sku: "NP-TOFU-2.5",
    name: "NookPaw Tofu Cat Litter",
    category: "tofu",
    packageSize: { value: 2.5, unit: "kg" },
    uom: { base: "bag", case: { factor: BAGS_PER_CASE } },
    reorderPoint: DEFAULT_REORDER_POINT,
    active: true,
  },
  {
    sku: "NP-TAPI-2.5",
    name: "NookPaw Tapioca Cat Litter",
    category: "tapioca",
    packageSize: { value: 2.5, unit: "kg" },
    uom: { base: "bag", case: { factor: BAGS_PER_CASE } },
    reorderPoint: DEFAULT_REORDER_POINT,
    active: true,
  },
];

let ensuredOnce = false;

export async function ensureReady(): Promise<{ db: Db; client: MongoClient }> {
  const client = await getMongoClient();
  const db = await getDb();
  if (ensuredOnce) return { db, client };

  await products(db).createIndex({ sku: 1 }, { unique: true });
  await stock(db).createIndex({ productId: 1 }, { unique: true });
  await movements(db).createIndex({ createdAt: -1 });
  await movements(db).createIndex({ productId: 1, createdAt: -1 });
  await movements(db).createIndex({ type: 1, createdAt: -1 });

  const existing = await products(db).countDocuments();

  if (existing === 0) {
    const now = new Date();
    const prodMap = new Map<LitterCategory, ObjectId>();

    for (const p of SEED_PRODUCTS) {
      const res = await products(db).insertOne({
        ...p,
        createdAt: now,
        updatedAt: now,
      } as ProductDoc);
      prodMap.set(p.category, res.insertedId);
    }

    const legacy = db.collection<{
      type: LitterCategory;
      bags?: number;
    }>("inventory");
    const legacyDocs = await legacy.find({}).toArray();
    const legacyByCat = new Map<LitterCategory, number>();
    for (const d of legacyDocs) {
      legacyByCat.set(d.type, Math.max(0, Number(d.bags ?? 0)));
    }

    for (const p of SEED_PRODUCTS) {
      const productId = prodMap.get(p.category)!;
      const initialBags = legacyByCat.get(p.category) ?? 0;

      await stock(db).insertOne({
        _id: new ObjectId(),
        productId,
        onHandBags: initialBags,
        lastMovementAt: initialBags > 0 ? now : null,
        updatedAt: now,
      });

      if (initialBags > 0) {
        await movements(db).insertOne({
          _id: new ObjectId(),
          productId,
          sku: p.sku,
          productName: p.name,
          type: "ADJUSTMENT",
          reasonCode: "COUNT",
          unit: "bag",
          quantity: initialBags,
          bagsDelta: initialBags,
          bagsBefore: 0,
          bagsAfter: initialBags,
          reference: "MIGRATION",
          note: "Legacy inventory migrated",
          actor: "system",
          reverted: false,
          revertedBy: null,
          revertsMovementId: null,
          createdAt: now,
        });
      }
    }
  }

  ensuredOnce = true;
  return { db, client };
}

export async function listProductsWithStock(
  db: Db
): Promise<ProductWithStock[]> {
  const prods = await products(db).find({ active: true }).sort({ sku: 1 }).toArray();
  const ids = prods.map((p) => p._id);
  const stocks = await stock(db).find({ productId: { $in: ids } }).toArray();
  const stockMap = new Map<string, StockDoc>();
  for (const s of stocks) stockMap.set(s.productId.toHexString(), s);

  return prods.map((p) => {
    const s = stockMap.get(p._id.toHexString());
    const onHand = s?.onHandBags ?? 0;
    const status: ProductWithStock["status"] =
      onHand <= 0
        ? "OUT_OF_STOCK"
        : onHand <= p.reorderPoint
          ? "LOW_STOCK"
          : "IN_STOCK";
    return {
      sku: p.sku,
      name: p.name,
      category: p.category,
      packageSize: p.packageSize,
      uom: p.uom,
      reorderPoint: p.reorderPoint,
      active: p.active,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      onHandBags: onHand,
      lastMovementAt: s?.lastMovementAt ? s.lastMovementAt.toISOString() : null,
      status,
    };
  });
}

export async function getShippedBagsToday(db: Db): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const agg = await movements(db)
    .aggregate<{ total: number }>([
      {
        $match: {
          type: "SHIPMENT",
          createdAt: { $gte: start },
          reverted: { $ne: true },
        },
      },
      { $group: { _id: null, total: { $sum: { $abs: "$bagsDelta" } } } },
    ])
    .toArray();
  return agg[0]?.total ?? 0;
}

export type TxFn<T> = (session: ClientSession) => Promise<T>;

export async function withTransaction<T>(fn: TxFn<T>): Promise<T> {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export { MOVEMENT_TYPES };
