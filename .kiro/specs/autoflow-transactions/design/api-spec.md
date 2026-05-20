# API Specification — Unit: transactions (ข้อมูลพื้นฐาน)

## Overview
**API Style**: REST with OpenAPI/Swagger documentation
**Base URL**: `/api/v1/transactions`
**Auth**: JWT via `Authorization: Bearer <token>` — role-based access per endpoint
**Module Prefix**: `/api/v1/transactions/...`

## API Conventions
- **Pagination**: Offset-based (D3-10) — `?page=1&limit=20` (default limit=20, max=100)
- **Filtering**: `?status=OPEN&vendorId=uuid`
- **Sorting**: `?sort=createdAt:desc`
- **Date Range**: `?fromDate=2025-01-01&toDate=2025-01-31`
- **Versioning**: URL-based `/api/v1/`

## Error Format
```json
{
  "statusCode": 400,
  "message": "Human-readable message",
  "error": "Bad Request",
  "code": "DOMAIN_ERROR_CODE",
  "details": { "field": "value" }
}
```

---

## Endpoints

### Job Orders

#### POST /api/v1/transactions/job-orders
- **Description**: สร้าง Job Order ใหม่
- **Auth**: Cashier+
- **Stories**: US-008
- **Request**:
```json
{
  "customerId": "uuid",
  "items": [
    { "itemId": "uuid", "qty": 5, "unitPrice": 100.00, "description": "ซ่อมเครื่อง" }
  ],
  "notes": "optional notes"
}
```
- **Response 201**:
```json
{
  "id": "uuid",
  "joNumber": "JO-202501-0001",
  "customerId": "uuid",
  "status": "OPEN",
  "hasTempDo": false,
  "invoiceId": null,
  "items": [...],
  "totalAmount": 500.00,
  "vatAmount": 35.00,
  "grandTotal": 535.00,
  "createdAt": "2025-01-20T10:00:00Z"
}
```
- **Errors**: 400 Validation error, 401 Unauthorized

#### GET /api/v1/transactions/job-orders
- **Description**: List Job Orders with pagination + filters
- **Auth**: Cashier+
- **Query**: `?page=1&limit=20&status=OPEN&customerId=uuid&sort=createdAt:desc`
- **Response 200**:
```json
{
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
}
```

#### GET /api/v1/transactions/job-orders/:id
- **Description**: Get Job Order detail
- **Auth**: Cashier+
- **Response 200**: Full JobOrder object
- **Errors**: 404 Not found

#### PATCH /api/v1/transactions/job-orders/:id/status
- **Description**: Update JO status (OPEN → IN_PROGRESS → DONE)
- **Auth**: Cashier+
- **Stories**: US-008
- **Request**:
```json
{ "status": "IN_PROGRESS" }
```
- **Response 200**: Updated JobOrder
- **Errors**: 400 Invalid transition, 404 Not found

---

### Sales — Invoice & TEMP_DO

#### POST /api/v1/transactions/job-orders/:joId/temp-do
- **Description**: Issue TEMP_DO from completed JO (Path A)
- **Auth**: Cashier+
- **Stories**: US-009
- **Request**:
```json
{
  "warehouseId": "uuid",
  "items": [
    { "itemId": "uuid", "qty": 5 }
  ]
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "TEMP_DO", "status": "POSTED", ... },
  "arOpenItem": { "id": "uuid", "status": "OPEN", "originalAmount": 535.00 }
}
```
- **Errors**: 400 JO not DONE, 409 Already has TEMP_DO, 422 Stock insufficient

#### POST /api/v1/transactions/job-orders/:joId/invoice
- **Description**: Issue Invoice (auto-determines INVOICE_FROM_DO or SALE_INVOICE based on hasTempDo)
- **Auth**: Cashier+
- **Stories**: US-010, US-011
- **Request**:
```json
{
  "warehouseId": "uuid",
  "items": [
    { "itemId": "uuid", "qty": 5 }
  ]
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "SALE_INVOICE|INVOICE_FROM_DO", "status": "POSTED", "taxInvoiceNo": "INV-202501-0001" },
  "arOpenItem": { "id": "uuid", ... }
}
```
- **Errors**: 400 JO not DONE, 409 Already has invoice, 422 Stock insufficient

---

### Sales — Credit Notes

#### POST /api/v1/transactions/sales-cn/return
- **Description**: Create Sales Return CN (CN_SALES_RETURN)
- **Auth**: Supervisor+
- **Stories**: US-012
- **Request**:
```json
{
  "refInvoiceTxId": "uuid",
  "condition": "good|damaged_total",
  "items": [
    { "itemId": "uuid", "qty": 2, "warehouseId": "uuid" }
  ],
  "reason": "สินค้าชำรุด"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "CN_SALES_RETURN", "status": "POSTED" },
  "arReduction": { "openItemId": "uuid", "reducedAmount": 200.00, "newStatus": "PARTIAL" }
}
```
- **Errors**: 400 Invalid ref, 422 Return qty exceeds sale qty

#### POST /api/v1/transactions/sales-cn/price-adj
- **Description**: Create Sales Price Adjustment CN (CN_SALES_PRICE)
- **Auth**: Manager+
- **Stories**: US-013
- **Request**:
```json
{
  "refInvoiceTxId": "uuid",
  "adjustmentAmount": 50.00,
  "reason": "ส่วนลดพิเศษ"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "CN_SALES_PRICE", "status": "DRAFT" },
  "arReduction": { "openItemId": "uuid", "reducedAmount": 50.00 }
}
```
- **Errors**: 400 No reason provided, 400 Invalid ref

---

### AR Payment

#### POST /api/v1/transactions/ar/payments
- **Description**: Record AR payment with manual matching (D3-3)
- **Auth**: Cashier+
- **Stories**: US-014
- **Request**:
```json
{
  "customerId": "uuid",
  "totalAmount": 1000.00,
  "allocations": [
    { "arOpenItemId": "uuid", "amount": 535.00 },
    { "arOpenItemId": "uuid", "amount": 465.00 }
  ],
  "paymentMethod": "CASH|TRANSFER|CHEQUE",
  "paymentRef": "optional reference"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "AR_RECEIVE", "status": "POSTED" },
  "allocations": [
    { "arOpenItemId": "uuid", "amount": 535.00, "newStatus": "CLOSED" },
    { "arOpenItemId": "uuid", "amount": 465.00, "newStatus": "PARTIAL" }
  ]
}
```
- **Errors**: 400 Allocation sum ≠ totalAmount, 422 Payment exceeds balance

#### GET /api/v1/transactions/ar/open-items
- **Description**: List AR open items (for payment matching UI)
- **Auth**: Cashier+
- **Query**: `?customerId=uuid&status=OPEN,PARTIAL&page=1&limit=20`
- **Response 200**: Paginated list of AROpenItem

---

### Purchasing — Goods Receipt

#### POST /api/v1/transactions/purchasing/gr-receive
- **Description**: Record Goods Receipt (GR_RECEIVE)
- **Auth**: Store Staff+
- **Stories**: US-015
- **Request**:
```json
{
  "vendorId": "uuid",
  "taxInvoiceNo": "TAX-2025-001",
  "warehouseId": "uuid",
  "items": [
    { "itemId": "uuid", "qty": 100, "unitCost": 50.00, "landedCost": 5.00 }
  ],
  "period": "2025-01"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "GR_RECEIVE", "status": "POSTED", "maBefore": 48.00, "maAfter": 49.10 },
  "apOpenItem": { "id": "uuid", "status": "OPEN", "originalAmount": 5885.00 }
}
```
- **Errors**: 400 Missing taxInvoiceNo, 403 Period locked

#### POST /api/v1/transactions/purchasing/gr-return
- **Description**: Return goods to supplier (GR_RETURN)
- **Auth**: Supervisor+
- **Stories**: US-016
- **Request**:
```json
{
  "refGrTxId": "uuid",
  "vendorId": "uuid",
  "warehouseId": "uuid",
  "items": [
    { "itemId": "uuid", "qty": 10 }
  ],
  "reason": "สินค้าไม่ตรง spec"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "GR_RETURN", "status": "POSTED" },
  "clearing": { "id": "uuid", "clearingAmount": 491.00, "status": "OPEN" }
}
```
- **Errors**: 400 Invalid GR ref, 409 GR fully returned, 422 Stock insufficient

#### POST /api/v1/transactions/purchasing/gr-replacement
- **Description**: Receive replacement goods (GR_REPLACEMENT)
- **Auth**: Store Staff+
- **Stories**: US-017
- **Request**:
```json
{
  "refGrReturnTxId": "uuid",
  "clearingId": "uuid",
  "warehouseId": "uuid",
  "items": [
    { "itemId": "uuid", "qty": 10 }
  ]
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "GR_REPLACEMENT", "status": "POSTED", "maBefore": 49.10, "maAfter": 49.05 },
  "clearing": { "id": "uuid", "status": "CLOSED", "ppvAmount": 0 }
}
```
- **Errors**: 400 Invalid clearing ref, 409 Clearing already closed

---

### Purchasing — Credit Notes

#### POST /api/v1/transactions/purchasing/cn-return
- **Description**: Purchase CN for returned goods (CN_RETURN)
- **Auth**: Manager+
- **Stories**: US-018
- **Request**:
```json
{
  "refGrReturnTxId": "uuid",
  "clearingId": "uuid"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "CN_RETURN", "status": "POSTED" },
  "apReduction": { "openItemId": "uuid", "reducedAmount": 500.00 },
  "clearing": { "id": "uuid", "status": "CLOSED", "ppvAmount": -9.00 }
}
```
- **Errors**: 400 Invalid refs, 409 Clearing already closed

#### POST /api/v1/transactions/purchasing/cn-price-adj
- **Description**: Purchase CN for price adjustment (CN_PRICE_ADJ)
- **Auth**: Manager+
- **Stories**: US-019
- **Request**:
```json
{
  "refGrTxId": "uuid",
  "adjustmentPerUnit": 5.00,
  "qty": 100
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "CN_PRICE_ADJ", "status": "POSTED" },
  "apReduction": { "openItemId": "uuid", "reducedAmount": 500.00 },
  "inventoryImpact": { "remainingQty": 80, "soldQty": 20, "cogsAdjAmount": 100.00 }
}
```
- **Errors**: 403 Period locked, 400 Invalid GR ref

#### POST /api/v1/transactions/purchasing/cn-debt
- **Description**: Purchase CN debt only (AP_CN_DEBT)
- **Auth**: Manager+
- **Stories**: US-020
- **Request**:
```json
{
  "refInvoiceTxId": "uuid",
  "amount": 200.00,
  "reason": "ส่วนลดจ่ายเร็ว"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "AP_CN_DEBT", "status": "POSTED" },
  "apReduction": { "openItemId": "uuid", "reducedAmount": 200.00 }
}
```
- **Errors**: 400 No reason, 400 Invalid ref

---

### AP Payment

#### POST /api/v1/transactions/ap/payments
- **Description**: Record AP payment with manual matching (D3-3)
- **Auth**: Manager+
- **Stories**: US-021
- **Request**:
```json
{
  "vendorId": "uuid",
  "totalAmount": 5000.00,
  "allocations": [
    { "apOpenItemId": "uuid", "amount": 3000.00 },
    { "apOpenItemId": "uuid", "amount": 2000.00 }
  ],
  "paymentMethod": "TRANSFER|CHEQUE",
  "paymentRef": "CHQ-001"
}
```
- **Response 201**:
```json
{
  "txEntry": { "id": "uuid", "txType": "AP_PAYMENT", "status": "POSTED" },
  "allocations": [
    { "apOpenItemId": "uuid", "amount": 3000.00, "newStatus": "CLOSED" },
    { "apOpenItemId": "uuid", "amount": 2000.00, "newStatus": "PARTIAL" }
  ]
}
```
- **Errors**: 400 Allocation sum ≠ totalAmount, 422 Payment exceeds balance

#### GET /api/v1/transactions/ap/open-items
- **Description**: List AP open items (for payment matching UI)
- **Auth**: Manager+
- **Query**: `?vendorId=uuid&status=OPEN,PARTIAL&page=1&limit=20`
- **Response 200**: Paginated list of APOpenItem

---

### GR/IR Clearing

#### GET /api/v1/transactions/purchasing/clearings
- **Description**: List GR/IR clearings
- **Auth**: Manager+
- **Query**: `?vendorId=uuid&status=OPEN&page=1&limit=20`
- **Response 200**: Paginated list of GrIrClearing

---

## Endpoint Summary

| Method | Path | Auth | Story |
|--------|------|------|-------|
| POST | /job-orders | Cashier+ | US-008 |
| GET | /job-orders | Cashier+ | US-008 |
| GET | /job-orders/:id | Cashier+ | US-008 |
| PATCH | /job-orders/:id/status | Cashier+ | US-008 |
| POST | /job-orders/:joId/temp-do | Cashier+ | US-009 |
| POST | /job-orders/:joId/invoice | Cashier+ | US-010, US-011 |
| POST | /sales-cn/return | Supervisor+ | US-012 |
| POST | /sales-cn/price-adj | Manager+ | US-013 |
| POST | /ar/payments | Cashier+ | US-014 |
| GET | /ar/open-items | Cashier+ | US-014, US-027 |
| POST | /purchasing/gr-receive | Store+ | US-015 |
| POST | /purchasing/gr-return | Supervisor+ | US-016 |
| POST | /purchasing/gr-replacement | Store+ | US-017 |
| POST | /purchasing/cn-return | Manager+ | US-018 |
| POST | /purchasing/cn-price-adj | Manager+ | US-019 |
| POST | /purchasing/cn-debt | Manager+ | US-020 |
| POST | /ap/payments | Manager+ | US-021 |
| GET | /ap/open-items | Manager+ | US-021, US-026 |
| GET | /purchasing/clearings | Manager+ | — |

**Total**: 19 endpoints
