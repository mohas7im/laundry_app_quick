from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Branch(models.Model):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, unique=True, help_text='Short code, e.g. DXB1. Used on receipts.')
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'branches'
        constraints = [
            models.UniqueConstraint(Lower('name'), name='branch_name_unique_ci'),
        ]

    def __str__(self):
        return f'{self.name} ({self.code})'


class BranchMembership(models.Model):
    """A user works in a branch with one role. A user may have several memberships."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='memberships')
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='memberships')
    role = models.ForeignKey('roles.Role', on_delete=models.PROTECT, related_name='memberships')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['branch__name']
        constraints = [
            models.UniqueConstraint(fields=['user', 'branch'], name='one_role_per_user_per_branch'),
        ]

    def __str__(self):
        return f'{self.user} @ {self.branch} as {self.role}'
