import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  currentStock: integer("current_stock").notNull(),
  dailySales: numeric("daily_sales", { precision: 12, scale: 2 }).notNull(),
  supplierLeadTime: integer("supplier_lead_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  saleDate: date("sale_date").notNull(),
  unitsSold: integer("units_sold").notNull(),
  revenue: numeric("revenue", { precision: 12, scale: 2 }).notNull(),
});

export const recommendationsTable = pgTable("recommendations", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  priority: text("priority").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});