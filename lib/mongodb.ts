import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function createClient() {
  if (!uri) {
    throw new Error("Invalid/Missing environment variable: MONGODB_URI");
  }
  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

export function getMongoClient(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;
  const c = createClient();
  clientPromise = c.connect();
  return clientPromise;
}

const DB_NAME = "nookpaw_warehouse";

export async function getDb() {
  const c = await getMongoClient();
  return c.db(DB_NAME);
}
