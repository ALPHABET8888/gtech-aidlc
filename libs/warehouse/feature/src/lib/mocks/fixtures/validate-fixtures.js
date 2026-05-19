// Temporary validation script - can be deleted after verification
const items = require('./items.json');
const warehouses = require('./warehouses.json');
const stockBalances = require('./stock-balances.json');
const periods = require('./periods.json');

const itemIds = new Set(items.map(i => i.id));
const whIds = new Set(warehouses.map(w => w.id));
let errors = 0;
for (const sb of stockBalances) {
  if (!itemIds.has(sb.itemId)) { console.error('Missing item:', sb.itemId); errors++; }
  if (!whIds.has(sb.warehouseId)) { console.error('Missing warehouse:', sb.warehouseId); errors++; }
}
const openPeriods = periods.filter(p => p.status === 'OPEN');
const closedPeriods = periods.filter(p => p.status === 'CLOSED');
console.log('Referential integrity errors:', errors);
console.log('Open periods:', openPeriods.length, '| Closed periods:', closedPeriods.length);
if (errors === 0) console.log('ALL OK');
