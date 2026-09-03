// Google Tag Manager storefront event tracker.
//
// The platform runs this file inside an iframe that is a direct child of the storefront page.
// The dataLayer lives on that parent window, created by snippets/global-header.html. Every access
// to the parent goes through storefront() and push(), both wrapped in try/catch: when the
// storefront is itself embedded (theme preview, a landing page framing the store) the parent can
// be cross-origin and any property read throws. push() creates the dataLayer if the container has
// not loaded yet so an early event is queued rather than lost (the GTM bootstrap keeps an existing
// array), and warns once because that usually means the theme is missing the global_header hook.
// The snippet applies the same enable gate (.strip in the template), so both halves agree on when the app is on.
if (app.settings.google_tag_manager_enabled && String(app.settings.google_tag_manager_container_id || '').trim()) {
    (function () {

        var warned = false;

        var storefront = function () {
            try {
                var parent = window.parent;
                // Touch a property so a cross-origin parent fails here, inside the try.
                void parent.document;
                return parent;
            } catch (e) {
                return null;
            }
        };

        var push = function (payload) {
            try {
                var win = storefront();
                if (!win) { return; }
                if (!win.dataLayer) {
                    win.dataLayer = [];
                    if (!warned && typeof console !== 'undefined' && console.warn) {
                        warned = true;
                        console.warn('[Google Tag Manager app] dataLayer was missing on the storefront page; check that the theme renders the global_header app hook.');
                    }
                }
                win.dataLayer.push(payload);
            } catch (e) {
                // A cross-origin parent must never break the tracker.
            }
        };

        var pageFields = function () {
            try {
                var win = storefront();
                if (!win) { return {}; }
                var doc = win.document || {};
                var loc = win.location || {};
                return {
                    page_referrer: doc.referrer,
                    page_title: doc.title,
                    page_path: loc.pathname,
                    page_location: loc.href
                };
            } catch (e) {
                return {};
            }
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
            return vouchers && vouchers.length ? vouchers[0].name : undefined;
        };

        // GA4 rejects an event with more than 200 items outright, so longer lists are truncated
        // to the first 200: a partial list still reaches the report, a dropped event does not.
        var MAX_ITEMS = 200;

        // Items share identifiers across the funnel: item_id is the product id everywhere, sku and
        // item_variant identify the child. A product payload only names a sku when it has one
        // (or a single variant); on a multi-variant PDP the viewed variant is not in the payload.
        var productItem = function (product, index) {
            var price = product.purchase_info && product.purchase_info.price;
            var variants = product.variants;
            var category = product.categories && product.categories.length ? product.categories[0].name : undefined;
            return {
                item_id: String(product.id),
                item_name: product.title,
                sku: product.sku || (variants && variants.length === 1 ? variants[0].sku : undefined),
                item_category: category,
                price: num(price && price.price),
                quantity: 1,
                index: index
            };
        };

        // Unit price/discount are derived from line totals; when the payload has no positive
        // quantity they are left undefined rather than invented.
        var cartLineItem = function (line, index) {
            var quantity = num(line.quantity);
            var perUnit = function (total) {
                return total === undefined || !(quantity > 0) ? undefined : round(total / quantity);
            };
            return {
                item_id: String(line.product_id),
                item_name: line.product_title,
                sku: line.sku || undefined,
                item_variant: line.variant_title || undefined,
                price: perUnit(num(line.price_incl_tax)),
                discount: perUnit(num(line.total_discount)),
                quantity: quantity,
                index: index
            };
        };

        var checkoutLines = function (data) {
            return ((data && data.lines) || []).filter(function (line) {
                return line && line.product_id != null;
            }).slice(0, MAX_ITEMS);
        };

        // GA4 defines value on checkout events as item revenue (sum of price x quantity);
        // shipping and tax travel in their own parameters. total_incl_tax is the order grand
        // total, so value is rebuilt from the lines.
        var checkoutEcommerce = function (data) {
            var lines = checkoutLines(data);
            var value;
            lines.forEach(function (line) {
                var total = num(line.price_incl_tax);
                if (total !== undefined) { value = (value || 0) + total; }
            });
            return {
                currency: data.currency,
                value: round(value),
                coupon: coupon(data),
                items: lines.map(cartLineItem)
            };
        };

        // Google's recommended pattern: clear the previous ecommerce object before each ecommerce push.
        var pushEcommerce = function (name, ecommerce) {
            push({ ecommerce: null });
            var payload = Object.assign({ event: name }, pageFields());
            payload.ecommerce = ecommerce;
            push(payload);
        };

        // The Google tag inside the container already sends its own page_view; this push is for
        // container triggers only. Do not attach a GA4 event tag to it (see README).
        analytics.subscribe('page_viewed', function () {
            push(Object.assign({ event: 'page_view' }, pageFields()));
        });

        // The category payload carries the products only (no category object), so the list is
        // identified by the page: path as the stable id, title as the display name.
        analytics.subscribe('product_category_viewed', function (event) {
            var products = (Array.isArray(event.data) ? event.data : []).filter(function (product) {
                return product && product.id != null;
            });
            if (!products.length) { return; }
            // Currency comes from the first priced product in the whole list, before truncation.
            var priced = products.filter(function (product) {
                return product.purchase_info && product.purchase_info.price;
            })[0];
            products = products.slice(0, MAX_ITEMS);
            var page = pageFields();
            pushEcommerce('view_item_list', {
                item_list_id: page.page_path,
                item_list_name: page.page_title,
                currency: priced && priced.purchase_info.price.currency,
                items: products.map(productItem)
            });
        });

        analytics.subscribe('product_viewed', function (event) {
            var product = event.data;
            if (!product || product.id == null) { return; }
            var price = product.purchase_info && product.purchase_info.price;
            pushEcommerce('view_item', {
                currency: price && price.currency,
                value: num(price && price.price),
                items: [productItem(product, 0)]
            });
        });

        var cartLineEvent = function (name) {
            return function (event) {
                var line = event.data;
                if (!line || line.product_id == null) { return; }
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
            if (!event.data) { return; }
            pushEcommerce('begin_checkout', checkoutEcommerce(event.data));
        });

        analytics.subscribe('checkout_shipping_method_submitted', function (event) {
            if (!event.data) { return; }
            var ecommerce = checkoutEcommerce(event.data);
            ecommerce.shipping_tier = event.data.shipping_method || undefined;
            pushEcommerce('add_shipping_info', ecommerce);
        });

        analytics.subscribe('checkout_completed', function (event) {
            var data = event.data;
            if (!data) { return; }
            if (data.is_test && app.settings.google_tag_manager_skip_test_orders) { return; }
            var ecommerce = checkoutEcommerce(data);
            ecommerce.transaction_id = data.number;
            ecommerce.shipping = num(data.shipping_incl_tax);
            ecommerce.tax = num(data.total_tax);
            pushEcommerce('purchase', ecommerce);
        });

    })();
}
