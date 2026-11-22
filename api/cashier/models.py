"""
Cash-up (build pack M6): a cashier's shift at one branch.

    shift: opened with the cash already in the drawer (the float); every payment and
    refund the cashier records meanwhile points at it; closed by counting the drawer.

    expected cash = float + cash taken − cash refunded
    difference    = counted − expected   (negative = short, positive = over)
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

MONEY = {'max_digits': 10, 'decimal_places': 2}


class Shift(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='shifts')
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='shifts')
    opened_at = models.DateTimeField(auto_now_add=True)
    opening_float = models.DecimalField(**MONEY, help_text='Cash in the drawer at the start.')
    closed_at = models.DateTimeField(null=True, blank=True)
    expected_cash = models.DecimalField(**MONEY, null=True, blank=True, help_text='Worked out when the shift closes.')
    counted_cash = models.DecimalField(**MONEY, null=True, blank=True, help_text='Counted in the drawer at the end.')
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'shifts'
        ordering = ['-opened_at']
        constraints = [
            # one open shift per cashier per branch
            models.UniqueConstraint(fields=['opened_by', 'branch'], condition=Q(closed_at__isnull=True),
                                    name='shifts_one_open_per_cashier_branch_uq'),
        ]

    def __str__(self):
        return f'{self.opened_by} @ {self.branch} from {self.opened_at:%Y-%m-%d %H:%M}'

    @property
    def is_open(self):
        return self.closed_at is None

    @property
    def difference(self):
        if self.counted_cash is None or self.expected_cash is None:
            return None
        return self.counted_cash - self.expected_cash
