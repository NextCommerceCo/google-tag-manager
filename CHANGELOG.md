# Changelog

## Unreleased

- Snippet and tracker are gated on a non-empty Container ID; a store that only ticks "Enable" no longer loads `gtm.js?id=` (#5). The tracker creates `window.top.dataLayer` if the container has not loaded yet instead of throwing.
- All money fields are numbers, unit `price`/`discount` are derived from line totals, one item shape across the funnel (`item_id` = product id, `sku`, `item_variant`) (#6).
- New events: `view_item_list`, `remove_from_cart`, `add_shipping_info`. New "Skip Test Orders" setting.
- Added a Node test harness (`npm test`) and a CI workflow.
