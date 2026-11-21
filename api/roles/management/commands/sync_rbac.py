from django.core.management.base import BaseCommand

from roles.models import Action, Menu, Permission, Role, RolePermission
from roles.seed import sync_all


class Command(BaseCommand):
    help = 'Write actions and system menus from roles/registry.py, and keep permissions in step.'

    def handle(self, *args, **options):
        sync_all(Menu, Permission, Action, Role, RolePermission)
        self.stdout.write(self.style.SUCCESS(
            f'{Action.objects.count()} actions, {Menu.objects.count()} menus, '
            f'{Permission.objects.count()} permissions.'
        ))
