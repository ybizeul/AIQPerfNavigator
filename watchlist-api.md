# Active IQ Watchlist v2 API

Base URL: `https://api.activeiq.netapp.com/`

Auth: header `AuthorizationToken: <API_KEY>` (SsoService) on every call.

## Member categories (shared shape across all endpoints)

A watchlist can contain any combination of:
- `customer_details[]`: `{ customer_id, customer_name }`
- `site_details[]`: `{ site_id, site_name }`
- `group_details[]`: `{ group_id, group_name }`
- `cluster_details[]`: `{ cluster_identifier, cluster_name }`
- `system_list[]`: `{ sys_serial_no, system_id }`
- `partner_details[]`: `{ partner_id, partner_name }`
- `salesrep_details[]`: `{ salesrep_id, salesrep_name }`

## Endpoints

### `GET /v2/watchlist/list`
List all watchlists for the user.
- Headers: `authorizationToken` (access token)
- Response: `{ results: { default_watchlist_id, watchlist: [{ owner, shared_status, type, watchlist_id, watchlist_name }] } }`

### `GET /v2/watchlist/action?id={watchlistId}`
View one watchlist's full detail.
- Response: `{ watchlist_name, watchlist_id, customer_details[], site_details[], group_details[], cluster_details[], system_list[], partner_details[], salesrep_details[], owner, shared_status }`

### `POST /v2/watchlist/action`
Create a watchlist.
- Body: `{ watchlist_name, customer_details[], site_details[], group_details[], cluster_details[], system_list[], partner_details[], salesrep_details[] }` (all fields optional except nothing is strictly required)
- Response: `{ watchlist_name, watchlist_id, status: { request_id, response_time, client_id, status_code, error_code, message } }`

### `PUT /v2/watchlist/action`
Update a watchlist (full replace of the same body shape as create — presumably including `watchlist_id` to target it, though the spec doesn't show an explicit `watchlist_id` field in the PUT body table; same body schema as POST).
- Body: same as POST
- Response: same as POST

### `DELETE /v2/watchlist/action`
Delete a watchlist.
- Params: `id` (path, required) — the watchlist ID
- Response: 200 OK, no body

### `GET /v2/watchlist/count?id={watchlistId}`
Get total system count for a watchlist.
- Response: `{ results: { count: number } }`

### `PUT /v2/watchlist/default?id={watchlistId}`
Mark a watchlist as the user's default.
- Response: 200 OK, no body

### `PUT /v2/watchlist/share`
Share a watchlist with other internal users.
- Body: `{ watchlist_id, user_names: string[] }`
- Response: 200 OK, no body

### `PUT /v2/watchlist/clone`
Clone a watchlist (note: reuses the `share` body shape — `watchlist_id` + `user_names`).
- Body: `{ watchlist_id, user_names: string[] }`
- Response: 200 OK, no body

### `PUT /v2/watchlist/cspscope?id={watchlistId}&nagp_id={optional}`
Link a watchlist as a CSP scope. Validates all systems belong to one NAGP; idempotent.
- Response: `{ results: { watchlist_id, is_csp, csp_nagp_id } }`

### `DELETE /v2/watchlist/cspscope?id={watchlistId}`
Unlink a watchlist from CSP scope. Idempotent.
- Response: `{ results: { watchlist_id, is_csp, csp_nagp_id } }`

### `GET /v2/watchlist/metadata?watchlist={watchlistId}`
Get rollup metadata (customer, site, partner, salesrep, NAGP, domestic parent, region, district, platform type) for the systems in a watchlist.
- Response: `{ results: { CUSTOMER, SITE, PARTNER, SALESREP, NAGP, DP, REGION, DISTRICT, PLATFORM_TYPE } }` (each a `{ *_id, *_name }` object, except REGION/DISTRICT/PLATFORM_TYPE which are single-string objects)

## Notes for implementation
- All mutating calls (`POST`/`PUT`/`DELETE` on `/action`) require `Content-Type: application/json` when sending a body.
- `DELETE /v2/watchlist/action` takes `id` as a **path**-style param per the table but the curl example shows it as a path segment pattern inconsistent with the `view`/`count` endpoints which use `id` as a **query** param — worth confirming against a live call before wiring up delete.
- The existing codebase only implements `GET /v2/watchlist/list` and `GET /v2/watchlist/action?id=...` (read-only), at `WATCHLIST_API_URL` / `WATCHLIST_ACTION_API_URL` in `src/App.tsx`. Create/update/delete/share/clone/default/cspscope/metadata are not yet implemented.
