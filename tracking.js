// Google Tag Manager storefront event tracker.
// Runs in the platform's sandboxed tracker frame; the dataLayer lives on the storefront window
// (window.top), created by snippets/global-header.html. push() creates it if the container has not
// loaded yet so an early event is queued rather than thrown away.
if (app.settings.google_tag_manager_enabled && app.settings.google_tag_manager_container_id) {
    (function () {

        var push = function (payload) {
            var top = window.top;
            if (!top) { return; }
            top.dataLayer = top.dataLayer || [];
            top.dataLayer.push(payload);
        };

        var pageFields = function () {
            var top = window.top || {};
            var doc = top.document || {};
            var loc = top.location || {};
            return {
                page_referrer: doc.referrer,
                page_title: doc.title,
                page_path: loc.pathname,
                page_location: loc.href
            };
        };

        // GA4 expects numbers; the storefront payload carries decimal strings ("79.99").
        var num = function (value) {
            var n = parseFloat(value);
            return isNaN(n) ? undefined : n;
        };

        var round = function (value) {
            return value === undefined ? undefined : Math.round(value * 100) / 100;
        };

        var coupon = function (data) {
            var vouchers = data && data.voucher_discounts;
            return vouchers && vouchers.length ? vouchers[0].name : '';
        };

        // One item shape for the whole funnel: item_id is the product id everywhere, sku and
        // item_variant identify the child.
        var productItem = function (product, index) {
            var price = product && product.purchase_info && product.purchase_info.price;
            var variants = product && product.variants;
            var category = product && product.categories && product.categories.length ? product.categories[0].name : undefined;
            return {
                item_id: String(product.id),
                item_name: product.title,
                sku: product.sku || (variants && variants.length ? variants[0].sku : undefined),
                item_category: category,
                price: num(price && price.price),
                quantity: 1,
                index: index
            };
        };

        var cartLineItem = function (line, index) {
            var quantity = num(line.quantity) || 1;
            var lineTotal = num(line.price_incl_tax);
            var lineDiscount = num(line.total_discount);
            return {
                item_id: String(line.product_id),
                item_name: line.product_title,
                sku: line.sku || undefined,
                item_variant: line.variant_title || undefined,
                price: round(lineTotal === undefined ? undefined : lineTotal / quantity),
                discount: round(lineDiscount === undefined ? undefined : lineDiscount / quantity),
                quantity: quantity,
                index: index
            };
        };

        var checkoutItems = function (data) {
            return ((data && data.lines) || []).map(cartLineItem);
        };

        // Google's recommended pattern: clear the previous ecommerce object before each ecommerce push.
        var pushEcommerce = function (name, ecommerce) {
            push({ ecommerce: null });
            var payload = Object.assign({ event: name }, pageFields());
            payload.ecommerce = ecommerce;
            push(payload);
        };

        analytics.subscribe('page_viewed', function () {
            push(Object.assign({ event: 'page_view' }, pageFields()));
        });

        analytics.subscribe('product_category_viewed', function (event) {
            var products = Array.isArray(event.data) ? event.data : [];
            if (!products.length) { return; }
            var first = products[0].purchase_info && products[0].purchase_info.price;
            pushEcommerce('view_item_list', {
                item_list_name: pageFields().page_title,
                currency: first && first.currency,
                items: products.map(productItem)
            });
        });

        analytics.subscribe('product_viewed', function (event) {
            var product = event.data || {};
            var price = product.purchase_info && product.purchase_info.price;
            pushEcommerce('view_item', {
                currency: price && price.currency,
                value: num(price && price.price),
                items: [productItem(product, 0)]
            });
        });

        var cartLineEvent = function (name) {
            return function (event) {
                var line = event.data || {};
                pushEcommerce(name, {
                    currency: line.currency,
                    value: num(line.price_incl_tax),
                    items: [cartLineItem(line, 0)]
                });
            };
        };

        analytics.subscribe('product_added_to_cart', cartLineEvent('add_to_cart'));
        analytics.subscribe('product_removed_from_cart', cartLineEvent('remove_from_cart'));

        analytics.subscribe('checkout_started', function (event) {
            var data = event.data || {};
            pushEcommerce('begin_checkout', {
                currency: data.currency,
                value: num(data.total_incl_tax),
                coupon: coupon(data),
                items: checkoutItems(data)
            });
        });

        analytics.subscribe('checkout_shipping_method_submitted', function (event) {
            var data = event.data || {};
            pushEcommerce('add_shipping_info', {
                currency: data.currency,
                value: num(data.total_incl_tax),
                coupon: coupon(data),
                shipping_tier: data.shipping_method || undefined,
                items: checkoutItems(data)
            });
        });

        analytics.subscribe('checkout_completed', function (event) {
            var data = event.data || {};
            if (data.is_test && app.settings.google_tag_manager_skip_test_orders) { return; }
            pushEcommerce('purchase', {
                currency: data.currency,
                value: num(data.total_incl_tax),
                transaction_id: data.number,
                coupon: coupon(data),
                shipping: num(data.shipping_incl_tax),
                tax: num(data.total_tax),
                items: checkoutItems(data)
            });
        });

    })();
}
