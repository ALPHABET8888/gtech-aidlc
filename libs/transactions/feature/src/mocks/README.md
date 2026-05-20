# Master Data Mock Module

Mock implementations ของ Master Data services สำหรับใช้ระหว่างพัฒนา Unit "transactions"
ใช้ DI pattern (D3-4) เพื่อให้ swap เป็น real implementation ได้ง่าย

## Architecture

```
TransactionsModule
  └── imports: [MasterDataMockModule]  ← swap to MasterDataModule later
        ├── ITxLogService         → MockTxLogService
        ├── IMaCalculationService → MockMaCalculationService
        ├── IStockValidationService → MockStockValidationService
        ├── IPeriodService        → MockPeriodService
        ├── IRefChainService      → MockRefChainService
        └── IMasterDataLookupService → MockMasterDataLookupService
```

## Mock Services

### MockTxLogService
- สร้าง fake TxEntry พร้อม UUID
- เก็บ TX ใน in-memory Map
- รองรับ createTx, postTx, voidTx, findById, findByReference

### MockMaCalculationService
- คำนวณ MA ตามสูตรจริง: `newMA = (currentQty * currentMA + inQty * inCost) / (currentQty + inQty)`
- Configurable MA values per item+warehouse
- Default MA = 100.00 THB

### MockStockValidationService
- Default: passes ทุก validation (stock = 1000)
- Configurable: set specific items to fail
- Configurable: set custom stock balances
- Configurable: freeze warehouses

### MockPeriodService
- Default: ทุก period เป็น OPEN
- Configurable: close specific periods
- Configurable: fail all validations

### MockRefChainService
- Default: passes ทุก validation
- Configurable: set specific TX types to fail
- Configurable: custom error messages

### MockMasterDataLookupService
- อ่านข้อมูลจาก JSON fixtures (`mock-data/*.json`)
- รองรับ getItem, getVendor, getCustomer, getWarehouse
- รองรับ listItems, listVendors, listCustomers, listWarehouses
- Override ข้อมูลได้ผ่าน setItems(), setVendors(), etc.

## JSON Fixtures

```
mock-data/
├── items.json        — 5 items (น้ำมันเครื่อง, ผ้าเบรค, กรองอากาศ, หัวเทียน, น้ำยาหม้อน้ำ)
├── vendors.json      — 3 vendors
├── customers.json    — 3 customers
└── warehouses.json   — 3 warehouses (หลัก, สำรอง, สินค้าเสีย)
```

## Configure Mocks (ในเทสต์)

```typescript
import { Test } from '@nestjs/testing';
import { MasterDataMockModule, MockStockValidationService } from './mocks';

const module = await Test.createTestingModule({
  imports: [MasterDataMockModule],
}).compile();

// Get mock service instance
const stockService = module.get<MockStockValidationService>('IStockValidationService');

// Configure behavior
stockService.setStockBalance('item-id', 'wh-id', 5);  // set stock = 5
stockService.setFailing('item-id', 'wh-id');           // force failure

// Reset after test
stockService.reset();
```

### Configure MA Values

```typescript
const maService = module.get<MockMaCalculationService>('IMaCalculationService');
maService.setMa('item-id', 'wh-id', 150.00);  // set MA = 150 THB
maService.setDefaultMa(200.00);                 // change default
```

### Configure Period Lock

```typescript
const periodService = module.get<MockPeriodService>('IPeriodService');
periodService.closePeriodMock('2024-01');  // close January 2024
periodService.setFailAll(true);            // fail all period checks
```

### Configure Ref Chain

```typescript
import { TxType } from '@autoflow/shared-types';

const refChainService = module.get<MockRefChainService>('IRefChainService');
refChainService.setFailing(TxType.CN_RETURN, 'GR_RETURN reference required');
```

### Override Lookup Data

```typescript
const lookupService = module.get<MockMasterDataLookupService>('IMasterDataLookupService');
lookupService.setItems([
  { id: 'custom-id', code: 'TEST-001', name: 'Test Item', unit: 'PCS', category: 'Test', isActive: true },
]);
```

## Swap to Real Implementation

เมื่อ Unit "master-data" พร้อม:

1. **เปลี่ยน import** ใน `transactions.module.ts`:
   ```typescript
   // Before (mock):
   import { MasterDataMockModule } from './mocks/master-data-mock.module';

   // After (real):
   import { MasterDataModule } from '@autoflow/master-data';
   ```

2. **เปลี่ยน imports array**:
   ```typescript
   @Module({
     imports: [
       MasterDataModule,  // ← เปลี่ยนจาก MasterDataMockModule
       AuthModule,
       PrismaModule,
     ],
   })
   ```

3. **Run integration tests** — ทุก test ที่ใช้ mock ต้อง pass กับ real module เช่นกัน

4. **ลบ mock files** (optional — เก็บไว้สำหรับ unit tests ก็ได้)

## DI Token Reference

| Token | Interface | Mock Class |
|-------|-----------|------------|
| `'ITxLogService'` | `ITxLogService` | `MockTxLogService` |
| `'IMaCalculationService'` | `IMaCalculationService` | `MockMaCalculationService` |
| `'IStockValidationService'` | `IStockValidationService` | `MockStockValidationService` |
| `'IPeriodService'` | `IPeriodService` | `MockPeriodService` |
| `'IRefChainService'` | `IRefChainService` | `MockRefChainService` |
| `'IMasterDataLookupService'` | `IMasterDataLookupService` | `MockMasterDataLookupService` |

## Injection Example

```typescript
@Injectable()
export class SalesService {
  constructor(
    @Inject('ITxLogService') private txLogService: ITxLogService,
    @Inject('IMaCalculationService') private maService: IMaCalculationService,
    @Inject('IStockValidationService') private stockService: IStockValidationService,
    @Inject('IPeriodService') private periodService: IPeriodService,
  ) {}
}
```
