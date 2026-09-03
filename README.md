# Google Tag Manager

Google Tag Manager app for Next Commerce. Installs the GTM container on any storefront theme and pushes GA4-style ecommerce events to the `dataLayer` through [Storefront Event Tracking](https://developers.nextcommerce.com/docs/storefront/event-tracking), so tags in the container can forward them to GA4, Ads, or any other destination.

## Settings

| Setting | Notes |
|---|---|
| Enable Google Tag Manager | Nothing loads until a Container ID is also set. |
| Google Tag Manager Container ID | `GTM-XXXXXXX`. |
| Skip Test Orders | Suppresses `purchase` for orders flagged `is_test`. |

## Events pushed to the dataLayer

| Storefront event | dataLayer event |
|---|---|
| `page_viewed` | `page_view` |
| `product_category_viewed` | `view_item_list` |
| `product_viewed` | `view_item` |
| `product_added_to_cart` | `add_to_cart` |
| `product_removed_from_cart` | `remove_from_cart` |
| `checkout_started` | `begin_checkout` |
| `checkout_shipping_method_submitted` | `add_shipping_info` |
| `checkout_completed` | `purchase` |

Each ecommerce push is preceded by `{ ecommerce: null }` as Google recommends. Items share identifiers across the funnel (`item_id` = product id, `sku`, `item_variant`, per-unit numeric `price` and `discount`). `value` on `begin_checkout`, `add_shipping_info` and `purchase` is item revenue (the sum of the lines), as GA4 defines it; `shipping` and `tax` travel in their own keys.

The `page_view` push exists for container triggers. The Google tag inside your container already sends its own page view, so do not attach a GA4 event tag to this push or page views double-count.

The tracker runs in a frame that is a direct child of the storefront page and reaches the `dataLayer` through `window.parent`; every access is wrapped so an embedded storefront with a cross-origin parent never throws. If the container has not loaded when the first event fires, the tracker creates the `dataLayer` (GTM keeps it) and logs one console warning, which usually means the theme does not render the `global_header` app hook.

## Tests

```bash
npm test
```

`tests/tracking.test.js` runs `tracking.js` with the platform's globals (`app`, `analytics`, `window.parent`) and asserts every push, plus the escaping in the snippet. No dependencies; Node 22, the version CI runs.
