import { Router, type IRouter } from "express";
import {
  AskCopilotBody,
  GetAnalyticsQueryParams,
  GetAnalyticsResponse,
  GetDashboardResponse,
  GetProductParams,
  GetProductResponse,
  UploadInventoryBody,
  UploadInventoryResponse,
  ListInventoryQueryParams,
  ListInventoryResponse,
  ListNotificationsResponse,
  ListRecommendationsResponse,
  UploadSalesBody,
  UploadSalesResponse,
} from "@workspace/api-zod";
import { db, productsTable, recommendationsTable, salesTable } from "@workspace/db";
import {
  aggregateDailySales,
  calculateInsights,
  calculateReorderQuantity,
  compactSeries,
  ensureDemoData,
  getEvidence,
  getProductInsight,
  getTrend,
  readStoreData,
  sortInsights,
  toProduct,
} from "../lib/stocksense";
import type { ProductInsight } from "../lib/stocksense";

const router: IRouter = Router();

function buildRecommendation(product: ReturnType<typeof calculateInsights>[number]) {
  const quantity = calculateReorderQuantity(product.currentStock, product.dailySales, product.supplierLeadTime);
  const safetyStock = Math.ceil(product.dailySales * 2);
  return {
    id: `rec-${product.id}`,
    productId: product.id,
    productName: product.name,
    priority: product.status === "CRITICAL" ? "HIGH" as const : product.status === "LOW" ? "MEDIUM" as const : "LOW" as const,
    problem:
      product.status === "OVERSTOCK"
        ? "Inventory is tying up cash at the current sales velocity."
        : product.status === "DECLINING"
          ? "Recent sales are below the previous comparison period."
          : "Inventory may run out before supplier delivery.",
    evidence: `${product.currentStock} units remaining • ${product.dailySales} units/day demand • ${product.supplierLeadTime}-day supplier lead time`,
    action:
      product.status === "OVERSTOCK"
        ? "Reduce next purchase"
        : product.status === "DECLINING"
          ? "Review pricing or promotion"
          : `Reorder ${quantity} units`,
    reorderQuantity: product.status === "CRITICAL" || product.status === "LOW" ? quantity : 0,
    calculation:
      product.status === "CRITICAL" || product.status === "LOW"
        ? `(${product.supplierLeadTime} days × ${product.dailySales}/day) + ${safetyStock} safety stock − ${product.currentStock} on hand, rounded to a 10-unit case`
        : "Based on calculated days remaining and recent sales velocity.",
    facts: [
      { label: "Current stock", value: `${product.currentStock} units` },
      { label: "Average daily sales", value: `${product.dailySales} units/day` },
      { label: "Days remaining", value: `${product.daysRemaining} days` },
      { label: "Sales growth", value: `${product.growthPercent}%` },
    ],
  };
}

router.get("/dashboard", async (_req, res, next) => {
  try {
    const { products, sales } = await readStoreData();
    const insights = calculateInsights(products, sales);
    const totalSales = sales.reduce((sum, sale) => sum + Number(sale.revenue), 0);
    const currentUnits = insights.reduce((sum, product) => sum + product.currentPeriodUnits, 0);
    const previousUnits = insights.reduce((sum, product) => sum + product.previousPeriodUnits, 0);
    const salesGrowth = previousUnits ? ((currentUnits - previousUnits) / previousUnits) * 100 : 0;
    const critical = insights.filter((product) => product.status === "CRITICAL" || product.status === "LOW").length;
    const overstock = insights.filter((product) => product.status === "OVERSTOCK").length;
    const declining = insights.filter((product) => product.status === "DECLINING").length;
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - critical * 3 - overstock * 1.5 - declining * 2)));
    const attention = insights
      .filter((product) => product.status !== "HEALTHY")
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 6)
      .map((product) => ({
        id: `attention-${product.id}`,
        productId: product.id,
        title:
          product.status === "CRITICAL"
            ? `${product.name} has less than ${Math.ceil(product.daysRemaining)} days of inventory`
            : product.status === "OVERSTOCK"
              ? `${product.name} is heavily overstocked`
              : product.status === "DECLINING"
                ? `${product.name} sales declined ${Math.abs(product.growthPercent)}%`
                : `${product.name} is approaching reorder point`,
        description: `${product.currentStock} units on hand • ${product.dailySales} units/day • ${product.supplierLeadTime}-day lead time`,
        severity: product.status === "CRITICAL" ? "CRITICAL" as const : product.status === "DECLINING" ? "INFO" as const : "WARNING" as const,
        action: product.recommendation,
      }));
    const inventoryHealth = [
      { label: "Healthy", value: insights.filter((product) => product.status === "HEALTHY").length, color: "#35b58b" },
      { label: "At risk", value: critical, color: "#ef6c5b" },
      { label: "Overstock", value: overstock, color: "#f3b34c" },
      { label: "Declining", value: declining, color: "#8176e8" },
    ];
    const dashboard = {
      totalSales: Math.round(totalSales),
      totalInventory: products.reduce((sum, product) => sum + product.currentStock, 0),
      lowStockProducts: critical,
      overstockProducts: overstock,
      salesGrowth: Math.round(salesGrowth * 10) / 10,
      healthScore,
      salesSeries: compactSeries(aggregateDailySales(sales, 30)),
      inventoryHealth,
      topProducts: insights.sort((a, b) => b.currentPeriodUnits - a.currentPeriodUnits).slice(0, 5).map(toProduct),
      slowProducts: insights.sort((a, b) => a.currentPeriodUnits - b.currentPeriodUnits).slice(0, 5).map(toProduct),
      attention,
    };
    res.json(GetDashboardResponse.parse(dashboard));
  } catch (error) {
    next(error);
  }
});

router.get("/inventory", async (req, res, next) => {
  try {
    const query = ListInventoryQueryParams.parse(req.query);
    const { products, sales } = await readStoreData();
    let insights = calculateInsights(products, sales);
    const search = query.search?.toLowerCase();
    if (search) insights = insights.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(search));
    if (query.category) insights = insights.filter((item) => item.category === query.category);
    if (query.status) insights = insights.filter((item) => item.status === query.status);
    insights = sortInsights(insights, query.sort ?? "risk");
    const start = (query.page - 1) * query.pageSize;
    const result = {
      items: insights.slice(start, start + query.pageSize).map(toProduct),
      total: insights.length,
      categories: [...new Set(products.map((product) => product.category))].sort(),
    };
    res.json(ListInventoryResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/products/:productId", async (req, res, next) => {
  try {
    const { productId } = GetProductParams.parse(req.params);
    const result = await getProductInsight(productId);
    if (!result) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const productDetail = {
      ...toProduct(result.product),
      previousPeriodUnits: result.product.previousPeriodUnits,
      trend: getTrend(productId, result.sales, 30),
      evidence: getEvidence(result.product),
    };
    res.json(GetProductResponse.parse(productDetail));
  } catch (error) {
    next(error);
  }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const query = GetAnalyticsQueryParams.parse({
      ...req.query,
      period: Number(req.query.period ?? 30),
    });
    const { products, sales } = await readStoreData();
    const insights = calculateInsights(products, sales);
    const period = query.period;
    const relevantSales = sales.filter((sale) => sale.saleDate >= new Date(Date.now() - period * 86400000).toISOString().slice(0, 10));
    const revenue = relevantSales.reduce((sum, sale) => sum + Number(sale.revenue), 0);
    const unitsSold = relevantSales.reduce((sum, sale) => sum + sale.unitsSold, 0);
    const current = sales.filter((sale) => sale.saleDate >= new Date(Date.now() - period * 86400000).toISOString().slice(0, 10)).reduce((sum, sale) => sum + sale.unitsSold, 0);
    const previous = sales.filter((sale) => sale.saleDate < new Date(Date.now() - period * 86400000).toISOString().slice(0, 10)).reduce((sum, sale) => sum + sale.unitsSold, 0);
    const categoryTotals = new Map<string, number>();
    relevantSales.forEach((sale) => {
      const product = products.find((item) => item.id === sale.productId);
      if (product) categoryTotals.set(product.category, (categoryTotals.get(product.category) ?? 0) + Number(sale.revenue));
    });
    const analytics = {
      period,
      revenue: Math.round(revenue),
      unitsSold,
      growthPercent: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : 0,
      salesSeries: compactSeries(aggregateDailySales(sales, period), 18),
      categoryRevenue: [...categoryTotals.entries()].map(([category, value]) => ({ category, value: Math.round(value) })),
      topProducts: [...insights].sort((a, b) => b.currentPeriodUnits - a.currentPeriodUnits).slice(0, 6).map(toProduct),
      bottomProducts: [...insights].sort((a, b) => a.currentPeriodUnits - b.currentPeriodUnits).slice(0, 6).map(toProduct),
    };
    res.json(GetAnalyticsResponse.parse(analytics));
  } catch (error) {
    next(error);
  }
});

router.get("/recommendations", async (_req, res, next) => {
  try {
    const { products, sales } = await readStoreData();
    const insights = calculateInsights(products, sales);
    const response = {
      immediate: insights.filter((item) => item.status === "CRITICAL").map(buildRecommendation),
      monitor: insights.filter((item) => ["LOW", "OVERSTOCK", "DECLINING"].includes(item.status)).map(buildRecommendation),
      noAction: insights.filter((item) => item.status === "HEALTHY").slice(0, 8).map(buildRecommendation),
    };
    res.json(ListRecommendationsResponse.parse(response));
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", async (_req, res, next) => {
  try {
    const { products, sales } = await readStoreData();
    const notifications = calculateInsights(products, sales)
      .filter((item) => item.status !== "HEALTHY")
      .slice(0, 8)
      .map((item, index) => ({
        id: `notice-${item.id}`,
        title: item.status === "CRITICAL" ? "Stock-out risk detected" : item.status === "OVERSTOCK" ? "Overstock detected" : item.status === "DECLINING" ? "Sales decline detected" : "Reorder point approaching",
        description: `${item.name}: ${item.recommendation}`,
        severity: item.status === "CRITICAL" ? "CRITICAL" as const : item.status === "DECLINING" ? "INFO" as const : "WARNING" as const,
        productId: item.id,
        createdAt: new Date(Date.now() - index * 3600000).toISOString(),
      }));
    res.json(ListNotificationsResponse.parse(notifications));
  } catch (error) {
    next(error);
  }
});

router.post("/copilot", async (req, res, next) => {
  try {
    const { question } = AskCopilotBody.parse(req.body);
    const { products, sales } = await readStoreData();
    const insights = calculateInsights(products, sales);
    const lower = question.toLowerCase();
    const risky = insights.filter((item) => item.status === "CRITICAL" || item.status === "LOW");
    const overstock = insights.filter((item) => item.status === "OVERSTOCK");
    const declining = insights.filter((item) => item.status === "DECLINING");
    let summary = "I don't have enough data to answer that.";
    let answer = "Try asking about stock-out risk, reorder actions, overstock, best sellers, or declining sales.";
    let referencedProducts: ProductInsight[] = [];
    if (lower.includes("reorder") || lower.includes("running out") || lower.includes("risk")) {
      referencedProducts = risky.slice(0, 5);
      summary = `${risky.length} products need immediate attention.`;
      answer = referencedProducts.map((item) => `${item.name}: ${item.currentStock} units left, ${item.dailySales} units/day, ${item.daysRemaining} days remaining. ${item.recommendation}.`).join(" ");
    } else if (lower.includes("overstock")) {
      referencedProducts = overstock.slice(0, 6);
      summary = `${overstock.length} products are carrying more than 60 days of inventory.`;
      answer = referencedProducts.map((item) => `${item.name} has ${item.currentStock} units at ${item.dailySales} units/day (${item.daysRemaining} days).`).join(" ");
    } else if (lower.includes("best") || lower.includes("selling")) {
      referencedProducts = [...insights].sort((a, b) => b.currentPeriodUnits - a.currentPeriodUnits).slice(0, 5);
      summary = "Top sellers in the last 30 days.";
      answer = referencedProducts.map((item, index) => `${index + 1}. ${item.name} — ${item.currentPeriodUnits} units`).join(" • ");
    } else if (lower.includes("losing") || lower.includes("declin")) {
      referencedProducts = declining.slice(0, 6);
      summary = `${declining.length} products are showing a meaningful sales decline.`;
      answer = referencedProducts.map((item) => `${item.name} is down ${Math.abs(item.growthPercent)}% versus the previous period.`).join(" ");
    } else if (lower.includes("wireless mouse")) {
      const mouse = insights.find((item) => item.name.toLowerCase() === "wireless mouse");
      if (mouse) {
        referencedProducts = [mouse];
        summary = "Wireless Mouse is marked critical because inventory will not cover supplier lead time.";
        answer = `${mouse.currentStock} units remaining ÷ ${mouse.dailySales} units/day = ${mouse.daysRemaining} days of inventory, versus a ${mouse.supplierLeadTime}-day supplier lead time. ${mouse.recommendation}.`;
      }
    } else if (lower.includes("attention") || lower.includes("today")) {
      referencedProducts = [...insights].filter((item) => item.status !== "HEALTHY").sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 6);
      summary = `${referencedProducts.length} items need attention today.`;
      answer = referencedProducts.map((item) => `${item.name}: ${item.recommendation}.`).join(" ");
    }
    const response = {
      question,
      summary,
      answer,
      evidence: referencedProducts.slice(0, 3).map(getEvidence),
      assumptions: referencedProducts.length ? ["Demand remains similar to the last 30 days."] : [],
      sufficientData: referencedProducts.length > 0,
      referencedProducts: referencedProducts.map(toProduct),
    };
    res.json(await import("@workspace/api-zod").then(({ AskCopilotResponse }) => AskCopilotResponse.parse(response)));
  } catch (error) {
    next(error);
  }
});

router.post("/demo/load", async (_req, res, next) => {
  try {
    await ensureDemoData();
    res.json({ imported: 50, errors: [], message: "Demo Store data is ready." });
  } catch (error) {
    next(error);
  }
});

async function importInventory(rows: Array<Record<string, unknown>>) {
  const errors: string[] = [];
  let imported = 0;
  for (const [index, row] of rows.entries()) {
    const id = String(row.product_id ?? "").trim();
    const name = String(row.product_name ?? "").trim();
    const category = String(row.category ?? "").trim();
    const price = Number(row.price);
    const currentStock = Number(row.current_stock);
    const dailySales = Number(row.daily_sales);
    const supplierLeadTime = Number(row.supplier_lead_time);
    if (!id || !name || !category || !Number.isFinite(price) || !Number.isFinite(currentStock) || !Number.isFinite(dailySales) || !Number.isFinite(supplierLeadTime)) {
      errors.push(`Row ${index + 2}: required inventory fields are missing or invalid.`);
      continue;
    }
    await db.insert(productsTable).values({ id, name, category, price: String(price), currentStock: Math.max(0, Math.round(currentStock)), dailySales: String(Math.max(0, dailySales)), supplierLeadTime: Math.max(0, Math.round(supplierLeadTime)) }).onConflictDoUpdate({ target: productsTable.id, set: { name, category, price: String(price), currentStock: Math.max(0, Math.round(currentStock)), dailySales: String(Math.max(0, dailySales)), supplierLeadTime: Math.max(0, Math.round(supplierLeadTime)) } });
    imported += 1;
  }
  return { imported, errors, message: `Imported ${imported} inventory rows.` };
}

router.post("/upload/inventory", async (req, res, next) => {
  try {
    const { rows } = UploadInventoryBody.parse(req.body);
    const result = await importInventory(rows);
    res.json(UploadInventoryResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.post("/upload/sales", async (req, res, next) => {
  try {
    const { rows } = UploadSalesBody.parse(req.body);
    const errors: string[] = [];
    let imported = 0;
    for (const [index, row] of rows.entries()) {
      const productId = String(row.product_id ?? "").trim();
      const saleDate = String(row.date ?? "").trim();
      const unitsSold = Number(row.units_sold);
      const revenue = Number(row.revenue);
      if (!productId || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || !Number.isFinite(unitsSold) || !Number.isFinite(revenue)) {
        errors.push(`Row ${index + 2}: required sales fields are missing or invalid.`);
        continue;
      }
      await db.insert(salesTable).values({ productId, saleDate, unitsSold: Math.max(0, Math.round(unitsSold)), revenue: String(Math.max(0, revenue)) });
      imported += 1;
    }
    res.json(UploadSalesResponse.parse({ imported, errors, message: `Imported ${imported} sales rows.` }));
  } catch (error) {
    next(error);
  }
});

export default router;