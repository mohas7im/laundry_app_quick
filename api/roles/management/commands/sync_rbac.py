from django.core.management.base import BaseCommand

from roles.models import OWNER_ROLE, Permission, Role, RolePermission
from roles.seed import ensure_owner_role, sync_permissions


class Command(BaseCommand):
    help = 'Write permissions from roles/registry.py into the database (and give new ones to Owner).'

    def handle(self, *args, **options):
        sync_permissions(Permission)
        if Role.objects.filter(name=OWNER_ROLE, is_system_role=True).exists():
            ensure_owner_role(Role, RolePermission, Permission)
        self.stdout.write(self.style.SUCCESS(f'{Permission.objects.count()} permissions.'))
