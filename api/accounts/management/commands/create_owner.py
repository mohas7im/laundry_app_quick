import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email

from accounts.models import User


class Command(BaseCommand):
    help = 'Create a shop Owner account (replaces createsuperuser).'

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
        if User.objects.filter(email=email).exists():
            raise CommandError(f'A user with email {email} already exists.')

        name = (opts['name'] or input('Full name: ')).strip()
        if not name:
            raise CommandError('Full name is required.')

        password = opts['password']
        if password is None:
            password = getpass.getpass('Password: ')
            if password != getpass.getpass('Password (again): '):
                raise CommandError('Passwords do not match.')

        user = User(email=email, full_name=name)
        try:
            validate_password(password, user)
        except ValidationError as e:
            raise CommandError(' '.join(e.messages))

        User.objects.create_owner(email=email, password=password, full_name=name, phone=opts['phone'])
        self.stdout.write(self.style.SUCCESS(f'Owner {name} <{email}> created.'))
