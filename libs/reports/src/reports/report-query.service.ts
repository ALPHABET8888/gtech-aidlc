import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { ApArStatus } from '@prisma/client';
import { ReportFilterDto } from './dto/report-filter.dto';
import {
  StockBalanceView,
  StockBalanceResponse,
} from './dto/stock-balance.dto';
import { APAgingView, APAgingResponse } from './dto/ap-aging.dto';
import { ARAgingView, ARAgingResponse } from './dto/ar-aging.dto';
import { DashboardResponse, RecentAlert } from './dto/dashboard.dto';

/**
 * Service responsible for generating stock balance, AP/AR aging reports,
 * and dashboard summary metrics.
 *
 * Uses real Prisma queries against PostgreSQL for all data.
 */
@Injectable()
export class ReportQueryService {
  private readonly logger = new Logger(ReportQueryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get stock balance report with pagination and filters.
   */
  async getStockReport(filter: ReportFilterDto): Promise<StockBalanceResponse> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    if (filter.itemId) where.itemId = filter.itemId;
    if (filter.warehouseId) where.warehouseId = filter.warehouseId;

    // If search keyword, filter by item name or warehouse name
    if (filter.search) {
      where.OR = [
        { item: { name: { contains: filter.search, mode: 'insensitive' } } },
        { warehouse: { name: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }

    const [balances, total] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where,
        skip,
        take: limit,
        include: {
          item: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.stockBalance.count({ where }),
    ]);

    const data: StockBalanceView[] = balances.map((sb) => ({
      itemId: sb.itemId,
      itemName: sb.item?.name ?? 'Unknown',
      warehouseId: sb.warehouseId,
      warehouseName: sb.warehouse?.name ?? 'Unknown',
      currentQty: Number(sb.qty),
      currentMA: Number(sb.ma),
      totalValue: Number(sb.qty) * Number(sb.ma),
    }));

    // Compute summary from all matching records (not just current page)
    const allBalances = await this.prisma.stockBalance.findMany({
      where,
      select: { itemId: true, qty: true, ma: true },
    });
    const totalValue = allBalances.reduce(
      (sum, b) => sum + Number(b.qty) * Number(b.ma),
      0,
    );
    const totalItems = new Set(allBalances.map((b) => b.itemId)).size;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: { totalItems, totalValue },
    };
  }

  /**
   * Get stock detail for a specific item across all warehouses.
   */
  async getStockDetail(
    itemId: string,
  ): Promise<{ item: { id: string; name: string }; warehouses: StockBalanceView[] }> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, name: true },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const balances = await this.prisma.stockBalance.findMany({
      where: { itemId },
      include: {
        warehouse: { select: { id: true, name: true } },
      },
    });

    const warehouses: StockBalanceView[] = balances.map((sb) => ({
      itemId: sb.itemId,
      itemName: item.name,
      warehouseId: sb.warehouseId,
      warehouseName: sb.warehouse?.name ?? 'Unknown',
      currentQty: Number(sb.qty),
      currentMA: Number(sb.ma),
      totalValue: Number(sb.qty) * Number(sb.ma),
    }));

    return { item, warehouses };
  }

  /**
   * Get AP aging report with pagination and filters.
   * Computes aging buckets based on asOfDate vs creation date.
   */
  async getAPAging(filter: ReportFilterDto): Promise<APAgingResponse> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const asOfDate = filter.asOfDate ? new Date(filter.asOfDate) : new Date();

    // Query open AP items from database
    const apWhere: any = {
      status: { in: [ApArStatus.OPEN, ApArStatus.PARTIAL] },
    };
    if (filter.vendorId) apWhere.vendorId = filter.vendorId;

    const apItems = await this.prisma.aPOpenItem.findMany({
      where: apWhere,
      select: {
        id: true,
        vendorId: true,
        remainingAmount: true,
        createdAt: true,
      },
    });

    // Get vendor names
    const vendorIds = [...new Set(apItems.map((i) => i.vendorId))];
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, name: true },
    });
    const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

    // Group by vendor and compute aging buckets
    const vendorAgingMap = new Map<string, APAgingView>();
    for (const item of apItems) {
      const daysDiff = this.computeDaysDiff(item.createdAt, asOfDate);
      const amount = Number(item.remainingAmount);

      if (!vendorAgingMap.has(item.vendorId)) {
        vendorAgingMap.set(item.vendorId, {
          vendorId: item.vendorId,
          vendorName: vendorMap.get(item.vendorId) ?? 'Unknown',
          totalOpen: 0,
          current: 0,
          days31_60: 0,
          days61_90: 0,
          over90: 0,
        });
      }

      const entry = vendorAgingMap.get(item.vendorId)!;
      entry.totalOpen += amount;
      this.assignAgingBucket(entry, amount, daysDiff);
    }

    const allData = Array.from(vendorAgingMap.values());
    const total = allData.length;
    const totalOpen = allData.reduce((sum, v) => sum + v.totalOpen, 0);

    const skip = (page - 1) * limit;
    const data = allData.slice(skip, skip + limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: { totalOpen, totalVendors: total },
    };
  }

  /**
   * Get AR aging report with pagination and filters.
   * Computes aging buckets based on asOfDate vs creation date.
   */
  async getARAging(filter: ReportFilterDto): Promise<ARAgingResponse> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const asOfDate = filter.asOfDate ? new Date(filter.asOfDate) : new Date();

    // Query open AR items from database
    const arWhere: any = {
      status: { in: [ApArStatus.OPEN, ApArStatus.PARTIAL] },
    };
    if (filter.customerId) arWhere.customerId = filter.customerId;

    const arItems = await this.prisma.aROpenItem.findMany({
      where: arWhere,
      select: {
        id: true,
        customerId: true,
        remainingAmount: true,
        createdAt: true,
      },
    });

    // Get customer names
    const customerIds = [...new Set(arItems.map((i) => i.customerId))];
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c.name]));

    // Group by customer and compute aging buckets
    const customerAgingMap = new Map<string, ARAgingView>();
    for (const item of arItems) {
      const daysDiff = this.computeDaysDiff(item.createdAt, asOfDate);
      const amount = Number(item.remainingAmount);

      if (!customerAgingMap.has(item.customerId)) {
        customerAgingMap.set(item.customerId, {
          customerId: item.customerId,
          customerName: customerMap.get(item.customerId) ?? 'Unknown',
          totalOpen: 0,
          current: 0,
          days31_60: 0,
          days61_90: 0,
          over90: 0,
        });
      }

      const entry = customerAgingMap.get(item.customerId)!;
      entry.totalOpen += amount;
      this.assignAgingBucket(entry, amount, daysDiff);
    }

    const allData = Array.from(customerAgingMap.values());
    const total = allData.length;
    const totalOpen = allData.reduce((sum, c) => sum + c.totalOpen, 0);

    const skip = (page - 1) * limit;
    const data = allData.slice(skip, skip + limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: { totalOpen, totalCustomers: total },
    };
  }

  /**
   * Get dashboard summary metrics.
   * Computes all metrics fresh from current data (no caching).
   */
  async getDashboard(): Promise<DashboardResponse> {
    // Query alert metrics from database
    const [totalAlerts, alertsByCodeRaw, recentAlertsRaw] = await Promise.all([
      this.prisma.alertLog.count(),
      this.prisma.alertLog.groupBy({
        by: ['alertCode'],
        _count: { alertCode: true },
      }),
      this.prisma.alertLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Transform groupBy result to Record<string, number>
    const alertsByCode: Record<string, number> = {};
    for (const group of alertsByCodeRaw) {
      alertsByCode[group.alertCode] = group._count.alertCode;
    }

    // Compute stock value from real stock_balance table
    const stockBalances = await this.prisma.stockBalance.findMany({
      select: { qty: true, ma: true },
    });
    const stockValue = stockBalances.reduce(
      (sum, sb) => sum + Number(sb.qty) * Number(sb.ma),
      0,
    );

    // Compute total AP from real ap_open_item table
    const apItems = await this.prisma.aPOpenItem.findMany({
      where: { status: { in: [ApArStatus.OPEN, ApArStatus.PARTIAL] } },
      select: { remainingAmount: true },
    });
    const totalAP = apItems.reduce(
      (sum, item) => sum + Number(item.remainingAmount),
      0,
    );

    // Compute total AR from real ar_open_item table
    const arItems = await this.prisma.aROpenItem.findMany({
      where: { status: { in: [ApArStatus.OPEN, ApArStatus.PARTIAL] } },
      select: { remainingAmount: true },
    });
    const totalAR = arItems.reduce(
      (sum, item) => sum + Number(item.remainingAmount),
      0,
    );

    // Map recent alerts to RecentAlert interface
    const recentAlerts: RecentAlert[] = recentAlertsRaw.map((alert) => ({
      id: alert.id,
      alertCode: alert.alertCode,
      alertMessage: alert.alertMessage,
      txType: alert.txType,
      userId: alert.userId,
      createdAt: alert.createdAt.toISOString(),
    }));

    return {
      totalAlerts,
      alertsByCode,
      stockValue,
      totalAP,
      totalAR,
      recentAlerts,
    };
  }

  /**
   * Compute the number of days between two dates.
   */
  private computeDaysDiff(from: Date, to: Date): number {
    const diffMs = to.getTime() - from.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Assign an amount to the correct aging bucket based on days difference.
   */
  private assignAgingBucket(
    entry: { current: number; days31_60: number; days61_90: number; over90: number },
    amount: number,
    daysDiff: number,
  ): void {
    if (daysDiff <= 30) {
      entry.current += amount;
    } else if (daysDiff <= 60) {
      entry.days31_60 += amount;
    } else if (daysDiff <= 90) {
      entry.days61_90 += amount;
    } else {
      entry.over90 += amount;
    }
  }
}
