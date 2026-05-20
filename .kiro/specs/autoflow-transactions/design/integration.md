# Integration Specifications — Unit: transactions (ข้อมูลพื้นฐาน)

## Overview
Unit "transactions" depends on "ข้อมูลหลัก" (Master Data) for core services. ในระหว่างพัฒนาจะใช้ Mock implementation ผ่าน DI (D3-4) — swap เป็น real module import ทีหลัง

**Pattern**: Direct module imports (Foundation DF-5)
**Mock Strategy**: Interface + Mock implementation via NestJS DI (D3-4)

---

## Inter-Unit Communication

### Synchronous Contracts (Mocked)

#### transactions → master-data: TX Log Creation
- **Interface**: `ITxLogService`
- **Method**: `createTx(dto: CreateTxDto): Promise<TxEntry>`
- **Used by**: SalesService, PurchasingService, ApArService
- **Mock behavior**: Returns fake TxEntry with generated UUID, auto-incremented tx_number
- **Real behavior** (future): Creates immutable TX Log entry in master_data schema

#### transactions → master-data: MA Calculation
- **Interface**: `IMaCalculationService`
- **Method**: `calculateNewMa(itemId, warehouseId, qty, value): Promise<MaResult>`
- **Method**: `getCurrentMa(itemId, warehouseId): Promise<number>`
- **Used by**: SalesService (TEMP_DO, SALE_INVOICE), PurchasingService (GR_RECEIVE, GR_REPLACEMENT)
- **Mock behavior**: Returns configurable MA values from JSON fixtures
- **Real behavior** (future): Calculates actual MA from stock balance

#### transactions → master-data: Stock Validation
- **Interface**: `IStockValidationService`
- **Method**: `validateStockAvailable(itemId, warehouseId, qty): Promise<void>`
- **Method**: `getStockBalance(itemId, warehouseId): Promise<number>`
- **Used by**: SalesService (TEMP_DO, SALE_INVOICE), PurchasingService (GR_RETURN)
- **Mock behavior**: Configurable — default passes, can set to throw StockNegativeException
- **Real behavior** (future): Checks actual stock balance atomically

#### transactions → master-data: Period Validation
- **Interface**: `IPeriodService`
- **Method**: `validatePeriodOpen(period: string): Promise<void>`
- **Used by**: All services before POST
- **Mock behavior**: Default passes, configurable to throw PeriodLockedException
- **Real behavior** (future): Checks period status in master_data schema

#### transactions → master-data: Reference Chain Validation
- **Interface**: `IRefChainService`
- **Method**: `validateRefChain(txType: TxType, refs: RefChainDto): Promise<void>`
- **Used by**: PurchasingService (CN needs GR ref), SalesService (CN needs Invoice ref)
- **Mock behavior**: Default passes, configurable to throw RefChainInvalidException
- **Real behavior** (future): Validates ref_* fields against existing POSTed TXs

#### transactions → master-data: Master Data Lookup
- **Interface**: `IMasterDataLookupService`
- **Method**: `getItem(itemId): Promise<Item>`
- **Method**: `getVendor(vendorId): Promise<Vendor>`
- **Method**: `getCustomer(customerId): Promise<Customer>`
- **Method**: `getWarehouse(warehouseId): Promise<Warehouse>`
- **Used by**: All services for validation and display
- **Mock behavior**: Returns data from JSON fixture files (mock-data/*.json)
- **Real behavior** (future): Reads from master_data schema

---

## Mock Module Configuration

### Module Swap Pattern

```typescript
// Development (mock):
// libs/transactions/feature/src/transactions.module.ts
@Module({
  imports: [
    MasterDataMockModule,  // ← mock implementation
    SharedAuthModule,
    SharedPrismaModule,
  ],
  // ...
})
export class TransactionsModule {}

// Production (real — future):
// libs/transactions/feature/src/transactions.module.ts
@Module({
  imports: [
    MasterDataModule,      // ← real implementation (swap this line)
    SharedAuthModule,
    SharedPrismaModule,
  ],
  // ...
})
export class TransactionsModule {}
```

### DI Token Registration

```typescript
// libs/transactions/feature/src/mocks/master-data-mock.module.ts
@Module({
  providers: [
    { provide: 'ITxLogService', useClass: MockTxLogService },
    { provide: 'IMaCalculationService', useClass: MockMaCalculationService },
    { provide: 'IStockValidationService', useClass: MockStockValidationService },
    { provide: 'IPeriodService', useClass: MockPeriodService },
    { provide: 'IRefChainService', useClass: MockRefChainService },
    { provide: 'IMasterDataLookupService', useClass: MockMasterDataLookupService },
  ],
  exports: [
    'ITxLogService',
    'IMaCalculationService',
    'IStockValidationService',
    'IPeriodService',
    'IRefChainService',
    'IMasterDataLookupService',
  ],
})
export class MasterDataMockModule {}
```

### Service Injection

```typescript
// Example: SalesService
@Injectable()
export class SalesService {
  constructor(
    @Inject('ITxLogService') private txLogService: ITxLogService,
    @Inject('IMaCalculationService') private maService: IMaCalculationService,
    @Inject('IStockValidationService') private stockService: IStockValidationService,
    @Inject('IPeriodService') private periodService: IPeriodService,
    private prisma: PrismaService,
    private apArService: ApArService,
  ) {}
}
```

---

## Integration Testing

**Strategy**: 
- Unit tests: Mock all external dependencies (Master Data services)
- Integration tests: Use mock module + real Prisma against test DB (transactions schema only)
- Future integration: When real Master Data module is ready, swap mock → real and run full integration

**Mocking in tests**:
```typescript
// Jest mock for unit tests
const mockTxLogService = {
  createTx: jest.fn().mockResolvedValue({ id: 'mock-tx-id', status: 'POSTED' }),
};

// Integration tests use MasterDataMockModule with configurable fixtures
```

**Contract Testing**: 
- Shared interfaces in `libs/shared-types/` serve as the contract
- CI validates that mock implementations match interface signatures
- When real module is available: run same test suite with real module to verify contract

---

## Linking Task (Future — Separate Task)

เมื่อ Unit 1 (master-data) พร้อม:
1. Replace `MasterDataMockModule` → `MasterDataModule` in imports
2. Remove mock-specific JSON fixtures
3. Run full integration test suite
4. Verify all TX Log entries are created correctly in master_data schema
5. Verify MA calculations use real stock data
6. Verify stock validation is atomic with TX POST
