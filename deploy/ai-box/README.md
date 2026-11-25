# Live deployment: Comfort Plus Laundry, Khalifa City (since 24 Nov 2026)

Runs on the Crown AI box (Ubuntu, Docker) behind a Cloudflare tunnel. Isolated Docker network `hq-net`.

| Container | Image | Role |
|---|---|---|
| hq-db | postgres:16 | database (volume `hq-pgdata`), not published to the host |
| hq-api | python:3.12-slim + venv volume | Django via gunicorn (3 workers), `DJANGO_SETTINGS_MODULE=pilot_settings` |
| hq-web | nginx:alpine | serves `client/dist`, proxies `/api/` to hq-api (see `nginx.conf`: large header buffers for the auth cookies) |
| hq-tunnel | cloudflare/cloudflared | public HTTPS link (quick tunnel for now; a named tunnel + domain is next) |

- `pilot_settings.py`: imports `config.settings`, adds the tunnel host to ALLOWED_HOSTS / CSRF_TRUSTED_ORIGINS and trusts X-Forwarded-Proto.
- Secrets (DB password, DJANGO_SECRET_KEY) live only in an env file on the box (0600), never in Git.
- Backup: `backup.sh` daily 23:30 Dubai, `pg_dump -Fc`, 30 days kept on the box.

## Go-live data (`seed/`, run with `manage.py shell -c "exec(open(...).read())"`)
- `seed.py`: company (name, address with TRN, phone, logo), branch KC33 Khalifa City 08:00-23:00, roles Supervisor
  (discount 25%) and Cashier (10%), users admin/supervisor/cashier @comfort.ae (passwords generated, sent to the owner
  privately), price list import from the CleanCloud export (4 services, 132 items, Walk-in + Online lists).
- `driver.py`: Driver role (orders view/print, collection, customers view, payments) + driver@comfort.ae.
- `catview.py`: org-wide read-only "Catalogue viewer" role for Supervisor and Cashier. Needed because catalogue
  APIs use `menu_permission` (organisation-wide roles only), so branch roles got 403 on Items/Prices.
- `tidy.py`: removed the test order/customer, reset KC33 numbering, service order Wash, Dry Cleaning, Pressed, Repairs.

## Front-end changes in this branch
- Comfort logo in sidebar and login, favicon, page title "Comfort Plus Laundry".
- Receipt: "Tax Invoice" heading (UAE FTA).
- New order: service tabs wrap with `h-auto` so "Pressed / Ironed" and "Repairs" show as real tabs.

## Suggested follow-ups for the code
1. Catalogue read access for branch roles (instead of the extra org role).
2. Full audit-log screen for the admin (who changed what, when).
3. Driver screens (pickup/delivery list).
4. TRN as its own company field on the receipt (now part of the address).
