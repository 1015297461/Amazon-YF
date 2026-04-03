import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, scrapeTasks, products, InsertScrapeTask, InsertProduct } from "../drizzle/schema";
import { ENV } from './_core/env';
import { hashPassword } from './_core/localAuth';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0] ?? undefined;
}

export async function createUserWithPassword(opts: {
  username: string;
  password: string;
  name?: string;
  role?: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getUserByUsername(opts.username);
  if (existing) throw new Error(`用户名 ${opts.username} 已存在`);

  const passwordHash = await hashPassword(opts.password);
  // openId for local users: "local:<username>"
  const openId = `local:${opts.username}`;
  const role = opts.role ?? (openId === `local:${ENV.ownerOpenId}` ? "admin" : "user");

  const result = await db.insert(users).values({
    openId,
    username: opts.username,
    passwordHash,
    name: opts.name ?? opts.username,
    loginMethod: "password",
    role,
    lastSignedIn: new Date(),
  });
  return result[0].insertId;
}

export async function updateUserPassword(userId: number, newPassword: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function countUsers() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ id: users.id }).from(users);
  return result.length;
}

// --- Scrape Task Operations ---

export async function createScrapeTask(task: InsertScrapeTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(scrapeTasks).values(task);
  return result[0].insertId;
}

export async function updateScrapeTask(taskId: number, updates: Partial<InsertScrapeTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(scrapeTasks).set(updates).where(eq(scrapeTasks.id, taskId));
}

export async function getUserTasks(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(scrapeTasks)
    .where(eq(scrapeTasks.userId, userId))
    .orderBy(desc(scrapeTasks.createdAt))
    .limit(limit);
}

// --- Product Operations ---

export async function insertProduct(product: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(products).values(product);
  return result[0].insertId;
}

export async function insertProducts(productList: InsertProduct[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (productList.length === 0) return;
  await db.insert(products).values(productList);
}

export async function getTaskProducts(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(products).where(eq(products.taskId, taskId));
}

export async function getUserProducts(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(products)
    .where(eq(products.userId, userId))
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

/**
 * Get a single task by ID (for history detail view)
 */
export async function getTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(scrapeTasks).where(eq(scrapeTasks.id, taskId)).limit(1);
  return result[0] ?? undefined;
}

/**
 * Get paginated scrape history tasks for a user, with product count summary.
 */
export async function getUserTaskHistory(userId: number, page = 1, pageSize = 20) {
  const db = await getDb();
  if (!db) return { tasks: [], total: 0 };

  const offset = (page - 1) * pageSize;
  const tasks = await db.select().from(scrapeTasks)
    .where(eq(scrapeTasks.userId, userId))
    .orderBy(desc(scrapeTasks.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Count total tasks for pagination
  const countResult = await db.select({ id: scrapeTasks.id }).from(scrapeTasks)
    .where(eq(scrapeTasks.userId, userId));
  const total = countResult.length;

  return { tasks, total };
}

/**
 * Get paginated products for a specific task (for history detail view)
 */
export async function getTaskProductsPaginated(taskId: number, page = 1, pageSize = 30) {
  const db = await getDb();
  if (!db) return { products: [], total: 0 };

  const offset = (page - 1) * pageSize;
  const productList = await db.select().from(products)
    .where(eq(products.taskId, taskId))
    .orderBy(desc(products.scrapedAt))
    .limit(pageSize)
    .offset(offset);

  const countResult = await db.select({ id: products.id }).from(products)
    .where(eq(products.taskId, taskId));
  const total = countResult.length;

  return { products: productList, total };
}
