# Google Tag Manager

Google Tag Manager app for Next Commerce that integrates Google Tag Manager into any storefront theme with [Storefront Event Tracking](https://developers.nextcommerce.com/docs/storefront/event-tracking). App also includes [Enhanced Ecommerce for Tag Manager](https://developers.google.com/analytics/devguides/collection/ua/gtm/enhanced-ecommerce) event tracking using the Data Layer.

**Google Tag Manager**
* Installs [Google Tag Manager](https://support.google.com/tagmanager/answer/6103696?hl=en) globally


**Google Ecommerce Events**
* [Product Detail Impressions](https://developers.google.com/analytics/devguides/collection/ua/gtm/enhanced-ecommerce#details)
* [Add to Cart](https://developers.google.com/analytics/devguides/collection/ua/gtm/enhanced-ecommerce#cart)
* [Checkout](https://developers.google.com/analytics/devguides/collection/ua/gtm/enhanced-ecommerce#checkout)
* [Purchases](https://developers.google.com/analytics/devguides/collection/ua/gtm/enhanced-ecommerce#purchases)


See tracking.js for a complete detailed view of the implementation.

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
