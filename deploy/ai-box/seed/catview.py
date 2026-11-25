# Catalogue pages are organisation-level in this app: branch roles cannot read them. A small org-wide,
# read-only role lets Supervisor and Cashier open Services / Items / Price Lists / Prices / Upcharges.
from django.db import transaction
from accounts.models import User
from roles.models import Permission, Role, RolePermission, UserRole
with transaction.atomic():
    r, _ = Role.objects.get_or_create(name='Catalogue viewer', defaults={'description': 'Read-only: services, items, price lists, prices, upcharges (all branches).'})
    r.max_discount_percent = 0; r.save()
    RolePermission.objects.filter(role=r).delete()
    for p in Permission.objects.select_related('menu', 'action').filter(menu__code__in=['catalogue', 'services', 'items', 'price_lists', 'prices', 'upcharges'], action__code='view'):
        RolePermission.objects.create(role=r, permission=p)
    for email in ['supervisor@comfort.ae', 'cashier@comfort.ae']:
        u = User.objects.get(email=email)
        UserRole.objects.get_or_create(user=u, role=r, branch=None)
print('catalogue viewer:', RolePermission.objects.filter(role=r).count(), 'permissions')
