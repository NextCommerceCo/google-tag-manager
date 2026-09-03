// Runs tracking.js the way the platform does: `app`, `analytics` and `window` are globals of the
// tracker frame, and the dataLayer lives on the parent (storefront) window. Payload samples follow the
// storefront event-tracking reference: https://developers.nextcommerce.com/docs/storefront/event-tracking
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'tracking.js'), 'utf8');
// Objects built inside the vm have a different Object prototype; compare them as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value));

function boot(settings, { parent, withDataLayer = true } = {}) {
    const handlers = {};
    const warnings = [];
    const storefront = parent === undefined
        ? { document: { title: 'Sheets | Velin', referrer: '' }, location: { pathname: '/p/', href: 'https://s.test/p/' } }
        : parent;
    if (storefront && parent === undefined && withDataLayer) storefront.dataLayer = [];
    const context = {
        app: { settings: { google_tag_manager_enabled: true, google_tag_manager_container_id: 'GTM-TEST', ...settings } },
        analytics: { subscribe: (name, fn) => { handlers[name] = fn; } },
        window: { parent: storefront },
        console: { warn: (...args) => warnings.push(args.join(' ')) },
    };
    vm.runInNewContext(source, context);
    return { top: storefront, warnings, emit: (name, data) => handlers[name] && handlers[name]({ event_type: name, data }), handlers };
}

const ecommerceEvents = top => top.dataLayer.filter(p => p.event);
const line = { currency: 'USD', product_id: 111, sku: 'WATCH-BL', product_title: 'Timeless Watch', variant_title: 'Black', quantity: 2, price_excl_tax: '159.98', price_incl_tax: '171.18', total_discount: '10.00' };
const second = { ...line, product_id: 222, sku: 'PILLOW', product_title: 'Pillow Cover', variant_title: '', quantity: 1, price_excl_tax: '39.99', price_incl_tax: '42.79', total_discount: '0.00' };
const checkout = { number: '109659', currency: 'USD', total_incl_tax: '218.96', shipping_incl_tax: '4.99', total_tax: '14.00', shipping_method: 'Express', voucher_discounts: [{ name: 'SAVE10' }], lines: [line, second], is_test: false };
const product = { id: 111, title: 'Timeless Watch', categories: [{ name: 'Watches' }], variants: [{ sku: 'WATCH-BL' }], purchase_info: { price: { currency: 'USD', price: '79.99' } } };

test('the tracker stays off when disabled or when the container id is empty, whitespace or missing', () => {
    for (const settings of [{ google_tag_manager_enabled: false }, { google_tag_manager_container_id: '' }, { google_tag_manager_container_id: '  ' }, { google_tag_manager_container_id: null }, { google_tag_manager_container_id: undefined }]) {
        assert.deepEqual(Object.keys(boot(settings).handlers), [], JSON.stringify(settings));
    }
});

test('never throws when the parent is missing or cross-origin', () => {
    const crossOrigin = new Proxy({}, { get() { throw new Error('SecurityError'); } });
    for (const [label, parent] of [['null', null], ['cross-origin', crossOrigin]]) {
        const { emit } = boot({}, { parent });
        for (const [name, data] of [['page_viewed', {}], ['product_category_viewed', [product]], ['product_viewed', product], ['product_added_to_cart', line], ['checkout_started', checkout], ['checkout_completed', checkout]]) {
            assert.doesNotThrow(() => emit(name, data), `${name} with ${label} parent`);
        }
    }
});

test('creates the dataLayer and warns once when the container has not loaded yet', () => {
    const { top, warnings, emit } = boot({}, { withDataLayer: false });
    emit('page_viewed', {});
    emit('product_added_to_cart', line);
    assert.equal(top.dataLayer[0].event, 'page_view');
    assert.deepEqual(plain(top.dataLayer[0]), { event: 'page_view', page_referrer: '', page_title: 'Sheets | Velin', page_path: '/p/', page_location: 'https://s.test/p/' });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /global_header/);
});

test('ecommerce pushes reset the previous ecommerce object first and carry one item shape', () => {
    const { top, emit } = boot({});
    emit('product_added_to_cart', line);
    assert.deepEqual(plain(top.dataLayer[0]), { ecommerce: null });
    const push = top.dataLayer[1];
    assert.equal(push.event, 'add_to_cart');
    assert.equal(push.page_title, 'Sheets | Velin');
    assert.equal(push.ecommerce.value, 159.98);
    assert.deepEqual(plain(push.ecommerce.items[0]), { item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_variant: 'Black', price: 79.99, discount: 5, quantity: 2, index: 0 });
});

test('cart events without a line payload are dropped', () => {
    const { top, emit } = boot({});
    emit('product_added_to_cart', undefined);
    emit('product_removed_from_cart', { quantity: 1 });
    assert.equal(top.dataLayer.length, 0);
});

test('unit price and discount are omitted without a positive quantity', () => {
    const { top, emit } = boot({});
    emit('product_added_to_cart', { ...line, quantity: 0 });
    emit('product_added_to_cart', { ...line, quantity: undefined, price_excl_tax: undefined, price_incl_tax: 'n/a' });
    emit('product_added_to_cart', { ...line, quantity: '3', price_excl_tax: '10.00', price_incl_tax: '10.70', total_discount: '1.00' });
    const [zero, missing, str] = ecommerceEvents(top).map(p => plain(p.ecommerce));
    assert.deepEqual(zero.items[0], { item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_variant: 'Black', quantity: 0, index: 0 });
    assert.equal(missing.value, undefined);
    assert.equal(missing.items[0].price, undefined);
    assert.deepEqual(str.items[0], { item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_variant: 'Black', price: 3.33, discount: 0.33, quantity: 3, index: 0 });
});

test('view_item maps the product payload, takes the sku from a single variant only, and skips products without an id', () => {
    const { top, emit } = boot({});
    emit('product_viewed', product);
    emit('product_viewed', { ...product, sku: 'TOP-SKU' });
    emit('product_viewed', { ...product, variants: [{ sku: 'A' }, { sku: 'B' }], categories: [] });
    emit('product_viewed', {});
    emit('product_viewed', { id: null, title: 'Broken' });
    const views = ecommerceEvents(top);
    assert.equal(views.length, 3);
    assert.deepEqual(plain(views[0].ecommerce), { currency: 'USD', value: 79.99, items: [{ item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_category: 'Watches', price: 79.99, quantity: 1, index: 0 }] });
    assert.equal(views[1].ecommerce.items[0].sku, 'TOP-SKU');
    assert.equal(views[2].ecommerce.items[0].sku, undefined);
    assert.equal(views[2].ecommerce.items[0].item_category, undefined);
});

test('view_item_list skips invalid entries, is dropped when empty, caps at 200 items, and takes currency from the first priced product', () => {
    const { top, emit } = boot({});
    emit('product_category_viewed', undefined);
    emit('product_category_viewed', { id: 5 });
    emit('product_category_viewed', []);
    emit('product_category_viewed', [null, { id: null }]);
    assert.equal(top.dataLayer.length, 0);
    const many = Array.from({ length: 250 }, (_, i) => ({ id: i + 1, title: `P${i + 1}` }));
    emit('product_category_viewed', [null, { id: 5, title: 'Unpriced' }, { id: 9, title: 'Sheets', purchase_info: { price: { currency: 'EUR', price: '99.00' } } }, ...many]);
    const list = ecommerceEvents(top)[0].ecommerce;
    assert.equal(list.items.length, 200);
    assert.equal(list.item_list_id, '/p/');
    assert.equal(list.currency, 'EUR');
});

test('begin_checkout value is item revenue, drops lines without a product, and add_shipping_info carries the tier', () => {
    const { top, emit } = boot({});
    emit('checkout_started', { ...checkout, lines: [line, second, { product_id: null, quantity: 1, price_incl_tax: '5.00' }] });
    emit('checkout_shipping_method_submitted', checkout);
    const [begin, ship] = ecommerceEvents(top);
    assert.equal(begin.event, 'begin_checkout');
    assert.equal(begin.ecommerce.value, 199.97);
    assert.equal(begin.ecommerce.coupon, 'SAVE10');
    assert.deepEqual(plain(begin.ecommerce.items), [
        { item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_variant: 'Black', price: 79.99, discount: 5, quantity: 2, index: 0 },
        { item_id: '222', item_name: 'Pillow Cover', sku: 'PILLOW', price: 39.99, discount: 0, quantity: 1, index: 1 },
    ]);
    assert.equal(ship.event, 'add_shipping_info');
    assert.equal(ship.ecommerce.shipping_tier, 'Express');
    assert.equal(ship.ecommerce.value, 199.97);
});

test('checkout events without a payload are dropped; an empty cart or missing voucher leaves value and coupon unset', () => {
    const { top, emit } = boot({});
    emit('checkout_started', undefined);
    emit('checkout_completed', null);
    assert.equal(top.dataLayer.length, 0);
    emit('checkout_shipping_method_submitted', { ...checkout, lines: [], voucher_discounts: [], shipping_method: null });
    assert.deepEqual(plain(ecommerceEvents(top)[0].ecommerce), { currency: 'USD', items: [] });
});

test('purchase reconciles to its items, carries shipping and tax separately, and skips test orders only when asked', () => {
    const { top, emit } = boot({});
    emit('checkout_completed', checkout);
    const purchase = ecommerceEvents(top)[0].ecommerce;
    assert.equal(purchase.transaction_id, '109659');
    assert.equal(purchase.value, 199.97);
    assert.equal(purchase.value, purchase.items.reduce((sum, i) => sum + i.price * i.quantity, 0));
    assert.equal(purchase.shipping, 4.99);
    assert.equal(purchase.tax, 14);
    assert.equal(purchase.coupon, 'SAVE10');
    const off = boot({});
    off.emit('checkout_completed', { ...checkout, is_test: true });
    off.emit('checkout_completed', { ...checkout, is_test: null });
    assert.deepEqual(ecommerceEvents(off.top).map(p => p.event), ['purchase', 'purchase']);
    const on = boot({ google_tag_manager_skip_test_orders: true });
    on.emit('checkout_completed', { ...checkout, is_test: true });
    assert.equal(on.top.dataLayer.length, 0);
});

test('every template interpolation inside the snippet is escaped and the gate matches the tracker', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'snippets', 'global-header.html'), 'utf8');
    assert.match(html.split('\n')[0], /google_tag_manager_enabled and app\.settings\.google_tag_manager_container_id\.strip/);
    const interpolations = [...html.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(m => m[1]);
    assert.ok(interpolations.length >= 1);
    for (const expr of interpolations) assert.match(expr, /\|escapejs$/, `unescaped interpolation: ${expr}`);
});
