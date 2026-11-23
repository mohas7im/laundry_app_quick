import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    """
    A login account (table `users`). What a user may do comes from their roles
    (`user_roles`), never from flags on this table.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=150, db_column='name')
    email = models.EmailField(max_length=254, unique=True)
    password = models.CharField(max_length=255, db_column='password_hash')
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    # approval PIN (a manager types it to approve a big discount or a change to a paid order);
    # an HMAC of the PIN, see accounts/pins.py
    pin_hash = models.CharField(max_length=64, blank=True)
    date_joined = models.DateTimeField(default=timezone.now, db_column='created_at')

    objects = UserManager()

    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'users'
        ordering = ['full_name']
        constraints = [
            models.UniqueConstraint(Lower('email'), name='users_email_lower_uq'),
        ]

    def __str__(self):
        return f'{self.full_name} <{self.email}>'
