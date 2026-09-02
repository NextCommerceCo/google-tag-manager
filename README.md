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

Each ecommerce push is preceded by `{ ecommerce: null }` as Google recommends. Items use one shape across the funnel (`item_id` = product id, `sku`, `item_variant`, per-unit numeric `price` and `discount`). Nothing loads until a Container ID is set. "Skip Test Orders" suppresses `purchase` for orders flagged `is_test`.

## Tests

```bash
npm test
```

`tests/tracking.test.js` runs `tracking.js` with the platform's globals (`app`, `analytics`, `window.top`) and asserts every push. No dependencies; Node 20+.
