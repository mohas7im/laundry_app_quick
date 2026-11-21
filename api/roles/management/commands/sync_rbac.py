from django.core.management.base import BaseCommand

from roles.models import OWNER_ROLE, Menu, Permission, Role, RolePermission
from roles.seed import ensure_owner_role, sync_system_menus


class Command(BaseCommand):
    help = 'Write system menus and their permissions from roles/registry.py (and give new ones to Owner).'

    def handle(self, *args, **options):
        sync_system_menus(Menu, Permission)
        if Role.objects.filter(name=OWNER_ROLE, is_system_role=True).exists():
            ensure_owner_role(Role, RolePermission, Permission)
        self.stdout.write(self.style.SUCCESS(f'{Menu.objects.count()} menus, {Permission.objects.count()} permissions.'))
