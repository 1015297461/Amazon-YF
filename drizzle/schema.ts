import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Scrape tasks - each batch scrape creates one task
 */
export const scrapeTasks = mysqlTable("scrape_tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  marketplace: varchar("marketplace", { length: 32 }).notNull(), // e.g. "US", "UK", "DE"
  totalAsins: int("totalAsins").notNull(),
  completedAsins: int("completedAsins").default(0).notNull(),
  failedAsins: int("failedAsins").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScrapeTask = typeof scrapeTasks.$inferSelect;
export type InsertScrapeTask = typeof scrapeTasks.$inferInsert;

/**
 * Product data - stores scraped product information
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  asin: varchar("asin", { length: 20 }).notNull(),
  marketplace: varchar("marketplace", { length: 32 }).notNull(),
  title: text("title"),
  brand: varchar("brand", { length: 500 }),
  price: varchar("price", { length: 100 }),
  rating: varchar("rating", { length: 20 }),
  reviewCount: varchar("reviewCount", { length: 50 }),
  availability: text("availability"),
  bulletPoints: json("bulletPoints"), // array of strings
  description: text("description"),
  mainImage: text("mainImage"),
  images: json("images"), // array of image URLs
  specifications: json("specifications"), // key-value pairs
  productDetails: json("productDetails"), // key-value pairs
  categories: text("categories"),
  seller: varchar("seller", { length: 500 }),
  // Best Sellers Rank
  bsrMainCategory: varchar("bsrMainCategory", { length: 500 }),
  bsrMainRank: int("bsrMainRank"),
  bsrSubCategory: varchar("bsrSubCategory", { length: 500 }),
  bsrSubRank: int("bsrSubRank"),
  bsrRawText: text("bsrRawText"),
  // A+ Content
  aplusImages: json("aplusImages"),       // array of A+ image URLs
  // Customer Reviews
  customersSay: text("customersSay"),
  reviewImages: json("reviewImages"),     // array of image URLs (up to 10)
  selectToLearnMore: json("selectToLearnMore"), // array of aspect labels
  status: mysqlEnum("productStatus", ["success", "failed"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
  scrapedAt: timestamp("scrapedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
