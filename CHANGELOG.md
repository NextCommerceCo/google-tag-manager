# Changelog

## [1.9] - 2026-09-03

- Snippet and tracker are gated on a non-empty Container ID; a store that only ticks "Enable" no longer loads `gtm.js?id=` (#5). The tracker creates `window.top.dataLayer` if the container has not loaded yet instead of throwing.
- All money fields are numbers, unit `price`/`discount` are derived from line totals, one item shape across the funnel (`item_id` = product id, `sku`, `item_variant`) (#6).
- New events: `view_item_list`, `remove_from_cart`, `add_shipping_info`. New "Skip Test Orders" setting.
- Review follow-ups: the tracker reaches the storefront through `window.parent` inside try/catch (an embedded storefront no longer throws on every event); checkout `value` is item revenue rather than the order grand total, and line prices exclude tax (`price_excl_tax`) since `tax` is reported separately; coupon is omitted when absent; lines without a product are dropped; item lists are truncated to GA4's 200-item limit; a one-time console warning when the dataLayer had to be created; the container id is URL-encoded in the bootstrap.
- Added a Node test harness (`npm test`) and a CI workflow.
