import { db, categoriesTable, productsTable, salesTable } from "@workspace/db";

const categories = [
  "Electronics",
  "Accessories",
  "Audio",
  "Office",
  "Computer Peripherals",
  "Mobile Accessories",
] as const;

type ProductRow = typeof productsTable.$inferSelect;
type SaleRow = typeof salesTable.$inferSelect;

export type ProductInsight = {
  id: string;
  name: string;
  category: string;
  price: number;
  currentStock: number;
  dailySales: number;
  supplierLeadTime: number;
  daysRemaining: number;
  status: "CRITICAL" | "LOW" | "HEALTHY" | "OVERSTOCK" | "DECLINING";
  recommendation: string;
  growthPercent: number;
  units30d: number;
  currentPeriodUnits: number;
  previousPeriodUnits: number;
};

const demoProducts = [
  ["Wireless Mouse", "Computer Peripherals", 1499, 8, 6, 5],
  ["USB-C Cable", "Mobile Accessories", 799, 12, 4, 5],
  ["Bluetooth Speaker", "Audio", 3499, 240, 2, 7],
  ["Laptop Stand", "Office", 2899, 30, 2.5, 6],
  ["Mechanical Keyboard", "Computer Peripherals", 6999, 42, 2.4, 8],
  ["27-inch Monitor", "Electronics", 18999, 18, 0.7, 10],
  ["Noise Cancelling Headphones", "Audio", 12999, 64, 2.1, 8],
  ["Webcam Pro", "Computer Peripherals", 5999, 26, 1.3, 7],
  ["Power Bank 20K", "Mobile Accessories", 2499, 35, 2.2, 6],
  ["Wireless Charger", "Mobile Accessories", 1799, 58, 1.5, 5],
  ["Desk Mat", "Office", 999, 82, 1.1, 5],
  ["Monitor Arm", "Office", 7499, 22, 0.8, 9],
  ["HDMI 2.1 Cable", "Accessories", 1299, 76, 2.6, 4],
  ["DisplayPort Cable", "Accessories", 1199, 49, 1.8, 5],
  ["USB Hub 7-Port", "Computer Peripherals", 2999, 31, 1.7, 6],
  ["Portable SSD 1TB", "Electronics", 8999, 28, 1.4, 8],
  ["Smart Plug", "Electronics", 1299, 96, 1.5, 4],
  ["LED Desk Lamp", "Office", 2299, 55, 1.2, 6],
  ["Ergonomic Chair Cushion", "Office", 1899, 19, 0.6, 8],
  ["Cable Organizer", "Accessories", 499, 180, 3.2, 4],
  ["Phone Tripod", "Mobile Accessories", 1599, 44, 1.3, 5],
  ["MagSafe Wallet", "Mobile Accessories", 1999, 11, 0.8, 7],
  ["Tablet Sleeve", "Accessories", 1399, 37, 0.9, 6],
  ["Laptop Sleeve 15\"", "Accessories", 1699, 46, 1.4, 5],
  ["Surge Protector", "Electronics", 2199, 63, 1.8, 6],
  ["Desk Fan", "Electronics", 2499, 27, 1.2, 7],
  ["USB Microphone", "Audio", 7999, 24, 0.8, 8],
  ["Studio Monitor Pair", "Audio", 24999, 7, 0.15, 14],
  ["Smart LED Strip", "Electronics", 1899, 51, 1.6, 6],
  ["Ethernet Cable 10m", "Accessories", 899, 105, 2.4, 4],
  ["Ring Light", "Electronics", 3199, 34, 1.1, 7],
  ["Document Scanner", "Office", 14999, 9, 0.35, 12],
  ["Label Maker", "Office", 3299, 29, 1.0, 7],
  ["Thermal Labels", "Office", 699, 260, 2.5, 5],
  ["Laptop Privacy Screen", "Office", 2199, 23, 0.7, 6],
  ["Graphics Tablet", "Computer Peripherals", 8999, 14, 0.4, 9],
  ["Vertical Mouse", "Computer Peripherals", 2399, 36, 1.1, 6],
  ["USB Flash Drive 128GB", "Electronics", 999, 118, 2.8, 4],
  ["Memory Card 256GB", "Electronics", 2299, 41, 1.0, 6],
  ["Car Phone Mount", "Mobile Accessories", 1299, 68, 1.9, 5],
  ["Bluetooth Tracker", "Mobile Accessories", 1799, 16, 0.6, 7],
  ["Smartwatch Band", "Mobile Accessories", 699, 90, 2.2, 5],
  ["Phone Case Pro", "Mobile Accessories", 999, 135, 3.5, 4],
  ["Desk Cable Tray", "Office", 1599, 73, 1.3, 6],
  ["Whiteboard Planner", "Office", 1299, 22, 0.5, 7],
  ["Meeting Speakerphone", "Audio", 10999, 8, 0.25, 12],
  ["Audio Interface", "Audio", 11999, 12, 0.35, 10],
  ["Keyboard Wrist Rest", "Computer Peripherals", 899, 94, 1.6, 5],
  ["Presentation Clicker", "Office", 1899, 33, 0.7, 6],
  ["Wi-Fi 6 Router", "Electronics", 7999, 21, 0.6, 9],
] as const;

function isoDate(daysAgo: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export async function ensureDemoData() {
  const existing = await db.select({ id: productsTable.id }).from(productsTable).limit(1);
  if (existing.length > 0) return;

  await db.insert(productsTable).values(
    demoProducts.map(([name, category, price, stock, dailySales, lead], index) => ({
      id: `prod-${String(index + 1).padStart(3, "0")}`,
      name,
      category,
      price: String(price),
      currentStock: stock,
      dailySales: String(dailySales),
      supplierLeadTime: lead,
    })),
  );
  await db
    .insert(categoriesTable)
    .values(categories.map((name) => ({ id: name.toLowerCase().replaceAll(" ", "-"), name })))
    .onConflictDoNothing();

  const sales: Array<typeof salesTable.$inferInsert> = [];
  demoProducts.forEach(([name, category, price, stock, dailySales], index) => {
    const productId = `prod-${String(index + 1).padStart(3, "0")}`;
    const isDeclining = name === "Laptop Stand";
    for (let day = 0; day < 60; day += 1) {
      const trendMultiplier = isDeclining && day < 30 ? 0.62 : isDeclining ? 1.05 : 1;
      const weekdayMultiplier = day % 7 === 5 || day % 7 === 6 ? 0.86 : 1.08;
      const wave = 1 + (((index * 7 + day * 3) % 9) - 4) / 25;
      const units = Math.max(0, Math.round(dailySales * trendMultiplier * weekdayMultiplier * wave));
      sales.push({
        productId,
        saleDate: isoDate(day),
        unitsSold: units,
        revenue: String(money(units * price)),
      });
    }
  });
  await db.insert(salesTable).values(sales);
}

export async function readStoreData() {
  await ensureDemoData();
  const [products, sales] = await Promise.all([
    db.select().from(productsTable),
    db.select().from(salesTable),
  ]);
  return { products, sales };
}

function getPeriodTotals(productId: string, sales: SaleRow[], start: number, end: number) {
  const startDate = isoDate(start);
  const endDate = isoDate(end);
  return sales
    .filter((sale) => sale.productId === productId && sale.saleDate >= startDate && sale.saleDate <= endDate)
    .reduce((sum, sale) => sum + sale.unitsSold, 0);
}

export function calculateInsights(products: ProductRow[], sales: SaleRow[]) {
  return products.map((product): ProductInsight => {
    const currentPeriodUnits = getPeriodTotals(product.id, sales, 29, 0);
    const previousPeriodUnits = getPeriodTotals(product.id, sales, 59, 30);
    const averageDailySales = currentPeriodUnits / 30 || Number(product.dailySales);
    const daysRemaining = averageDailySales > 0 ? Number(product.currentStock) / averageDailySales : 999;
    const growthPercent = previousPeriodUnits > 0
      ? ((currentPeriodUnits - previousPeriodUnits) / previousPeriodUnits) * 100
      : 0;
    const stockStatus =
      daysRemaining > 60
        ? "OVERSTOCK"
        : daysRemaining < Number(product.supplierLeadTime)
          ? "CRITICAL"
          : daysRemaining <= Number(product.supplierLeadTime) + 3
            ? "LOW"
            : growthPercent < -15
              ? "DECLINING"
              : "HEALTHY";
    const recommendation =
      stockStatus === "CRITICAL" || stockStatus === "LOW"
        ? `Reorder ${calculateReorderQuantity(Number(product.currentStock), averageDailySales, product.supplierLeadTime)} units`
        : stockStatus === "OVERSTOCK"
          ? "Reduce next purchase"
          : stockStatus === "DECLINING"
            ? "Review pricing or promotion"
            : "No action required";
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      price: Number(product.price),
      currentStock: product.currentStock,
      dailySales: round1(averageDailySales),
      supplierLeadTime: product.supplierLeadTime,
      daysRemaining: round1(daysRemaining),
      status: stockStatus,
      recommendation,
      growthPercent: round1(growthPercent),
      units30d: currentPeriodUnits,
      currentPeriodUnits,
      previousPeriodUnits,
    };
  });
}

export function calculateReorderQuantity(currentStock: number, dailySales: number, leadTime: number) {
  const safetyStock = Math.ceil(dailySales * 2);
  const target = Math.ceil(leadTime * dailySales + safetyStock);
  const raw = Math.max(0, target - currentStock);
  return Math.ceil(raw / 10) * 10;
}

export function getEvidence(product: ProductInsight) {
  return {
    source: "Sales Database",
    period: "Last 30 days",
    product: product.name,
    unitsSold: product.currentPeriodUnits,
    averageDailySales: product.dailySales,
    currentStock: product.currentStock,
    supplierLeadTime: product.supplierLeadTime,
    daysRemaining: product.daysRemaining,
    calculation: `${product.currentStock} / ${product.dailySales} = ${product.daysRemaining} days`,
    conclusion:
      product.status === "CRITICAL"
        ? "HIGH STOCK-OUT RISK"
        : product.status === "LOW"
          ? "MEDIUM STOCK-OUT RISK"
          : product.status === "OVERSTOCK"
            ? "HEAVILY OVERSTOCKED"
            : product.status === "DECLINING"
              ? "SALES DECLINING"
              : "HEALTHY INVENTORY",
  };
}

export async function getProductInsight(productId: string) {
  const { products, sales } = await readStoreData();
  const product = calculateInsights(products, sales).find((item) => item.id === productId);
  return product ? { product, sales } : undefined;
}

export function toProduct(product: ProductInsight) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    currentStock: product.currentStock,
    dailySales: product.dailySales,
    supplierLeadTime: product.supplierLeadTime,
    daysRemaining: product.daysRemaining,
    status: product.status,
    recommendation: product.recommendation,
    growthPercent: product.growthPercent,
    units30d: product.units30d,
  };
}

export function sortInsights(items: ProductInsight[], sort: string) {
  return [...items].sort((a, b) => {
    if (sort === "sales") return b.dailySales - a.dailySales;
    if (sort === "stock") return a.currentStock - b.currentStock;
    if (sort === "growth") return a.growthPercent - b.growthPercent;
    return a.daysRemaining - b.daysRemaining;
  });
}

export function getTrend(productId: string, sales: SaleRow[], days: number) {
  const start = Math.max(0, 60 - days);
  return sales
    .filter((sale) => sale.productId === productId)
    .filter((sale) => sale.saleDate >= isoDate(start) && sale.saleDate <= isoDate(0))
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate))
    .map((sale) => ({ label: sale.saleDate.slice(5), value: sale.unitsSold }));
}

export function aggregateDailySales(sales: SaleRow[], days: number) {
  const totals = new Map<string, number>();
  sales.forEach((sale) => {
    if (sale.saleDate >= isoDate(days - 1) && sale.saleDate <= isoDate(0)) {
      totals.set(sale.saleDate, (totals.get(sale.saleDate) ?? 0) + sale.unitsSold);
    }
  });
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label: label.slice(5), value }));
}

export function compactSeries(points: Array<{ label: string; value: number }>, max = 14) {
  if (points.length <= max) return points;
  const bucket = Math.ceil(points.length / max);
  return Array.from({ length: Math.ceil(points.length / bucket) }, (_, index) => {
    const slice = points.slice(index * bucket, (index + 1) * bucket);
    return {
      label: slice[0]?.label ?? "",
      value: slice.reduce((sum, point) => sum + point.value, 0),
    };
  });
}