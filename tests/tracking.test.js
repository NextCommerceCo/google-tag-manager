// Runs tracking.js the way the platform does: `app`, `analytics` and `window` are globals of the
// tracker frame, and the dataLayer lives on window.top. Payload samples follow developer-docs
// content/docs/storefront/event-tracking.mdx.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'tracking.js'), 'utf8');
// Objects built inside the vm have a different Object prototype; compare them as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value));

function boot(settings, { withDataLayer = true } = {}) {
    const handlers = {};
    const top = { document: { title: 'Sheets | Velin', referrer: '' }, location: { pathname: '/p/', href: 'https://s.test/p/' } };
    if (withDataLayer) top.dataLayer = [];
    const context = {
        app: { settings: { google_tag_manager_enabled: true, google_tag_manager_container_id: 'GTM-TEST', ...settings } },
        analytics: { subscribe: (name, fn) => { handlers[name] = fn; } },
        window: { top },
    };
    vm.runInNewContext(source, context);
    return { top, emit: (name, data) => handlers[name] && handlers[name]({ event_type: name, data }), handlers };
}

const ecommerceEvents = top => top.dataLayer.filter(p => p.event);
const line = { currency: 'USD', product_id: 111, sku: 'WATCH-BL', product_title: 'Timeless Watch', variant_title: 'Black', quantity: 2, price_incl_tax: '159.98', total_discount: '10.00' };
const checkout = { number: '109659', currency: 'USD', total_incl_tax: '164.97', shipping_incl_tax: '4.99', total_tax: '0.00', shipping_method: 'Express', voucher_discounts: [{ name: 'SAVE10' }], lines: [line], is_test: false };

test('does nothing without a container id', () => {
    assert.deepEqual(Object.keys(boot({ google_tag_manager_container_id: '' }).handlers), []);
});

test('a whitespace container id counts as unset', () => {
    assert.deepEqual(Object.keys(boot({ google_tag_manager_container_id: '  ' }).handlers), []);
});

test('cart events without a line payload are dropped', () => {
    const { top, emit } = boot({});
    emit('product_added_to_cart', undefined);
    emit('product_removed_from_cart', { quantity: 1 });
    assert.equal(top.dataLayer.length, 0);
});

test('creates the dataLayer when the container has not loaded yet', () => {
    const { top, emit } = boot({}, { withDataLayer: false });
    assert.doesNotThrow(() => emit('page_viewed', {}));
    assert.equal(top.dataLayer[0].event, 'page_view');
});

test('ecommerce pushes reset the previous ecommerce object first', () => {
    const { top, emit } = boot({});
    emit('product_added_to_cart', line);
    assert.deepEqual(plain(top.dataLayer[0]), { ecommerce: null });
    const push = top.dataLayer[1];
    assert.equal(push.event, 'add_to_cart');
    assert.equal(push.page_title, 'Sheets | Velin');
    assert.equal(push.ecommerce.value, 159.98);
    assert.deepEqual(plain(push.ecommerce.items[0]), { item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_variant: 'Black', price: 79.99, discount: 5, quantity: 2, index: 0 });
});

test('remove_from_cart, view_item_list and add_shipping_info are mapped', () => {
    const { top, emit } = boot({});
    emit('product_removed_from_cart', line);
    emit('product_category_viewed', [{ id: 5, title: 'Sheets', purchase_info: { price: { currency: 'USD', price: '109.99' } } }]);
    emit('checkout_shipping_method_submitted', checkout);
    assert.deepEqual(ecommerceEvents(top).map(p => p.event), ['remove_from_cart', 'view_item_list', 'add_shipping_info']);
    assert.equal(ecommerceEvents(top)[2].ecommerce.shipping_tier, 'Express');
});

test('begin_checkout maps a multi-line cart; null category entries are skipped', () => {
    const { top, emit } = boot({});
    const second = { ...line, product_id: 222, sku: 'PILLOW', product_title: 'Pillow Cover', variant_title: '', quantity: 1, price_incl_tax: '39.99', total_discount: '0.00' };
    emit('checkout_started', { ...checkout, lines: [line, second] });
    emit('product_category_viewed', [null, { id: null, title: 'Broken' }, { id: 5, title: 'Sheets', purchase_info: { price: { currency: 'USD', price: '109.99' } } }]);
    const [begin, list] = ecommerceEvents(top);
    assert.equal(begin.event, 'begin_checkout');
    assert.equal(begin.ecommerce.coupon, 'SAVE10');
    assert.deepEqual(plain(begin.ecommerce.items), [
        { item_id: '111', item_name: 'Timeless Watch', sku: 'WATCH-BL', item_variant: 'Black', price: 79.99, discount: 5, quantity: 2, index: 0 },
        { item_id: '222', item_name: 'Pillow Cover', sku: 'PILLOW', price: 39.99, discount: 0, quantity: 1, index: 1 },
    ]);
    assert.equal(list.ecommerce.items.length, 1);
    assert.equal(list.ecommerce.item_list_id, '/p/');
});

test('purchase carries numeric totals and skips test orders only when asked', () => {
    const { top, emit } = boot({});
    emit('checkout_completed', checkout);
    const purchase = ecommerceEvents(top)[0].ecommerce;
    assert.equal(purchase.transaction_id, '109659');
    assert.equal(purchase.value, 164.97);
    assert.equal(purchase.tax, 0);
    assert.equal(purchase.coupon, 'SAVE10');
    const skip = boot({ google_tag_manager_skip_test_orders: true });
    skip.emit('checkout_completed', { ...checkout, is_test: true });
    assert.equal(skip.top.dataLayer.length, 0);
});
