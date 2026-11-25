# Comfort Plus go-live seed for Hashim's app (run once, inside the hq-api image). Idempotent where possible.
# Prints only non-secret lines; passwords go to /secrets-out/creds.txt (0600) for the Telegram message.
import base64, os, secrets
from datetime import time
from django.db import transaction
from accounts.models import User
from branches.models import Branch, UserBranchAssignment
from company.models import CompanySettings
from roles.models import Permission, Role, RolePermission, UserRole
from roles.seed import ensure_owner_role
from catalogue import importer
from catalogue.models import Item

with transaction.atomic():
    c = CompanySettings.current()
    c.name = 'Comfort Plus Laundry'
    c.address = 'Royal Mini Market Bldg, Sector 33, Khalifa City, Abu Dhabi\nTRN: 100292845300003'
    c.phone = '+971 50 724 1717'
    with open('/seed/comfort-logo.png', 'rb') as f:
        c.logo = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()
    c.save()
    print('company ok')

    kc, _ = Branch.objects.get_or_create(code='KC33', defaults={'name': 'Khalifa City'})
    kc.name = 'Khalifa City'; kc.phone = '+971 50 724 1717'
    kc.address = 'Royal Mini Market Bldg, Sector 33, Khalifa City, Abu Dhabi'
    kc.opens_at = time(8, 0); kc.closes_at = time(23, 0)
    kc.save()
    print('branch ok')

    owner_role = ensure_owner_role(Role, RolePermission, Permission)
    ADMIN_MENUS = {'company', 'branches', 'roles', 'permissions', 'users', 'menus', 'common_masters'}
    CATALOGUE = {'services', 'items', 'price_lists', 'prices', 'upcharges'}
    COUNTER = {'dashboard', 'orders', 'production', 'collection', 'payments', 'shifts', 'customers'}

    def make_role(name, desc, perms_filter, max_disc):
        r, _ = Role.objects.get_or_create(name=name, defaults={'description': desc})
        r.description = desc; r.max_discount_percent = max_disc; r.save()
        RolePermission.objects.filter(role=r).delete()
        for p in Permission.objects.select_related('menu', 'action'):
            if perms_filter(p.menu.code, p.action.code):
                RolePermission.objects.create(role=r, permission=p)
        return r

    sup = make_role('Supervisor', 'Runs the branch: counter, production, payments, cash-up, reports, prices view.',
                    lambda m, a: m not in ADMIN_MENUS and (m not in CATALOGUE or a in ('view', 'print')), 25)
    cash = make_role('Cashier', 'Counter: new orders, customers, collection, payments, cash-up.',
                     lambda m, a: m in COUNTER and a != 'delete' or (m in CATALOGUE and a == 'view'), 10)
    print('roles ok')

    creds = []
    def make_user(email, name, role, branch):
        u = User.objects.filter(email=email).first()
        pw = f"Comfort{secrets.randbelow(9000) + 1000}"
        if not u:
            u = User.objects.create_user(email=email, password=pw, full_name=name)
        else:
            u.set_password(pw); u.save()
        if branch:
            UserBranchAssignment.objects.get_or_create(user=u, branch=branch)
        UserRole.objects.get_or_create(user=u, role=role, branch=branch)
        creds.append(f"{name}: {email} / {pw}")

    make_user('admin@comfort.ae', 'Admin', owner_role, None)
    make_user('supervisor@comfort.ae', 'Supervisor', sup, kc)
    make_user('cashier@comfort.ae', 'Cashier', cash, kc)
    print('users ok')

owner = User.objects.get(email='admin@comfort.ae')
if not Item.objects.exists():
    text = open('/seed/price-list-default.csv', encoding='utf-8-sig').read()
    res = importer.preview_or_import(text, user=owner, commit=True)
    print('price import:', res.get('summary'), 'errors:', len(res.get('errors') or []), 'warnings:', len(res.get('warnings') or []))
else:
    print('price list already there')

os.umask(0o077)
with open('/secrets-out/creds.txt', 'w') as f:
    f.write('\n'.join(creds) + '\n')
print('creds written')
