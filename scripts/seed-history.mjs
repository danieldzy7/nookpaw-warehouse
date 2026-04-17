import { MongoClient, ObjectId } from "mongodb";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const envRaw = readFileSync(envPath, "utf8");
const envMap = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) envMap[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const uri = envMap.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI missing from .env.local");

const DB_NAME = "nookpaw_warehouse";
const BAGS_PER_CASE = 6;

const client = new MongoClient(uri);
await client.connect();
const db = client.db(DB_NAME);

const products = await db
  .collection("products")
  .find({ active: true })
  .toArray();
if (products.length === 0) {
  console.log("No products found. Start the app first to seed products.");
  process.exit(1);
}
console.log(
  `Found ${products.length} products: ${products.map((p) => p.sku).join(", ")}`
);

await db
  .collection("movements")
  .deleteMany({ type: "SHIPMENT", note: "demo-seed" });
console.log("Cleared previous demo-seed shipments.");

const now = new Date();
const DAYS = 60;
const movementsToInsert = [];
let seq = 0;

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickHour(dow) {
  const businessWeights = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const weekendWeights = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const pool = dow >= 5 ? weekendWeights : businessWeights;
  return pool[rand(0, pool.length - 1)];
}

const salesPerDayDist = {
  0: [3, 6],
  1: [2, 5],
  2: [2, 5],
  3: [3, 6],
  4: [4, 8],
  5: [5, 10],
  6: [4, 9],
};

for (let i = DAYS - 1; i >= 0; i--) {
  const day = new Date(now);
  day.setDate(day.getDate() - i);
  day.setHours(0, 0, 0, 0);
  const dow = (day.getDay() + 6) % 7;
  const [minN, maxN] = salesPerDayDist[dow];
  const nOrders = rand(minN, maxN);

  for (let k = 0; k < nOrders; k++) {
    const product = products[rand(0, products.length - 1)];
    const hour = pickHour(dow);
    const minute = rand(0, 59);
    const ts = new Date(day);
    ts.setHours(hour, minute, rand(0, 59));

    const byCase = Math.random() < 0.35;
    let unit, quantity, bagsDelta;
    if (byCase) {
      unit = "case";
      quantity = rand(1, 3);
      bagsDelta = -quantity * BAGS_PER_CASE;
    } else {
      unit = "bag";
      quantity = rand(1, 5);
      bagsDelta = -quantity;
    }
    seq++;
    const refDate = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(ts.getDate()).padStart(2, "0")}`;
    movementsToInsert.push({
      _id: new ObjectId(),
      productId: product._id,
      sku: product.sku,
      productName: product.name,
      type: "SHIPMENT",
      reasonCode: Math.random() < 0.92 ? "SALE" : Math.random() < 0.5 ? "DAMAGE" : "OTHER",
      unit,
      quantity,
      bagsDelta,
      bagsBefore: 0,
      bagsAfter: 0,
      reference: `DEMO-${refDate}-${String(seq).padStart(4, "0")}`,
      note: "demo-seed",
      actor: "seed",
      reverted: false,
      revertedBy: null,
      revertsMovementId: null,
      createdAt: ts,
    });
  }
}

console.log(`Inserting ${movementsToInsert.length} demo shipments...`);
if (movementsToInsert.length > 0) {
  await db.collection("movements").insertMany(movementsToInsert);
}
console.log("Done.");
await client.close();
