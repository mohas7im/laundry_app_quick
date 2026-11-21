import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from accounts.models import User
from roles.models import Permission, Role, RolePermission, UserRole
from roles.seed import ensure_owner_role


class Command(BaseCommand):
    help = 'Create a user with the organization-wide Owner role.'

    def add_arguments(self, parser):
        parser.add_argument('--email')
        parser.add_argument('--name', help='Full name')
        parser.add_argument('--phone', default='')
        parser.add_argument(
            '--password',
            help='Non-interactive use only (e.g. scripts). Omit to be prompted securely.',
        )

    def handle(self, *args, **opts):
        email = (opts['email'] or input('Email: ')).strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError('Enter a valid email address.')
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError(f'A user with email {email} already exists.')

        name = (opts['name'] or input('Full name: ')).strip()
        if not name:
            raise CommandError('Full name is required.')

        password = opts['password']
        if password is None:
            password = getpass.getpass('Password: ')
            if password != getpass.getpass('Password (again): '):
                raise CommandError('Passwords do not match.')

        try:
            validate_password(password, User(email=email, full_name=name))
        except ValidationError as e:
            raise CommandError(' '.join(e.messages))

        with transaction.atomic():
            owner_role = ensure_owner_role(Role, RolePermission, Permission)
            user = User.objects.create_user(email=email, password=password, full_name=name, phone=opts['phone'])
            UserRole.objects.create(user=user, role=owner_role, branch=None)
        self.stdout.write(self.style.SUCCESS(f'Owner {name} <{email}> created.'))
