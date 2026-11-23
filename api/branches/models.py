import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Branch(models.Model):
    """A shop location (table `branches`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, unique=True, help_text='Short code, e.g. DXB1. Used on receipts.')
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    # opening hours and the ready-by calendar (orders/pricing.py suggested_ready_by)
    opens_at = models.TimeField(null=True, blank=True)
    closes_at = models.TimeField(null=True, blank=True, help_text='Ready-by times are never after closing.')
    cutoff_time = models.TimeField(null=True, blank=True,
                                   help_text='Orders taken after this count from the next day.')
    closed_weekdays = models.JSONField(default=list, blank=True, help_text='0 = Monday … 6 = Sunday.')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'branches'
        ordering = ['name']
        verbose_name_plural = 'branches'
        constraints = [
            models.UniqueConstraint(Lower('name'), name='branches_name_lower_uq'),
        ]

    def __str__(self):
        return f'{self.name} ({self.code})'


class BranchHoliday(models.Model):
    """A day the branch is closed: no order is promised for it (table `branch_holidays`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='holidays')
    date = models.DateField()
    name = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = 'branch_holidays'
        ordering = ['date']
        constraints = [models.UniqueConstraint(fields=['branch', 'date'], name='branch_holidays_uq')]


class UserBranchAssignment(models.Model):
    """Which branches a user works in (table `user_branch_assignments`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='branch_assignments')
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='assignments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_branch_assignments'
        constraints = [
            models.UniqueConstraint(fields=['user', 'branch'], name='user_branch_assignments_uq'),
        ]

    def __str__(self):
        return f'{self.user} @ {self.branch}'
