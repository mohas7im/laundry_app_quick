import os, secrets
from django.db import transaction
from accounts.models import User
from branches.models import Branch, UserBranchAssignment
from roles.models import Permission, Role, RolePermission, UserRole
with transaction.atomic():
    kc = Branch.objects.get(code='KC33')
    r, _ = Role.objects.get_or_create(name='Driver', defaults={'description': 'Pickup and delivery: find orders and customers, hand over ready orders, take payment on delivery.'})
    r.max_discount_percent = 0; r.save()
    RolePermission.objects.filter(role=r).delete()
    allow = {'orders': {'view', 'print'}, 'collection': {'view', 'create', 'edit'}, 'customers': {'view'}, 'payments': {'view', 'create'}}
    for p in Permission.objects.select_related('menu', 'action'):
        if p.action.code in allow.get(p.menu.code, set()):
            RolePermission.objects.create(role=r, permission=p)
    pw = f"Comfort{secrets.randbelow(9000) + 1000}"
    u = User.objects.filter(email='driver@comfort.ae').first()
    if not u:
        u = User.objects.create_user(email='driver@comfort.ae', password=pw, full_name='Driver')
    else:
        u.set_password(pw); u.save()
    UserBranchAssignment.objects.get_or_create(user=u, branch=kc)
    UserRole.objects.get_or_create(user=u, role=r, branch=kc)
os.umask(0o077)
lines = [l for l in open('/secrets-out/creds.txt').read().splitlines() if not l.startswith('Driver:')]
lines.append(f'Driver: driver@comfort.ae / {pw}')
open('/secrets-out/creds.txt', 'w').write('\n'.join(lines) + '\n')
print('driver ok;', RolePermission.objects.filter(role=r).count(), 'permissions;', 'roles:', list(Role.objects.values_list('name', flat=True)))
