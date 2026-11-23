"""
Manager approval at the counter.

Some changes need more rights than the cashier has: a discount over their role's limit
(roles.max_discount_percent), or changing an order that has been paid (payments.edit,
the same right as giving refunds). If the cashier has the right, nothing is asked;
otherwise a manager who has it types their approval PIN (accounts/pins.py), and the
request is sent again with `approval_pin`.

The API answers a missing or wrong PIN with a field error on `approval_pin`; the
counter opens the PIN dialog when it sees one.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

from rest_framework import serializers

from accounts.access import get_access
from accounts.pins import user_with_pin


def discount_limit(user, branch_id):
    """The biggest discount (percent) the user may give in this branch; None = no limit."""
    access = get_access(user)
    if access.is_owner:
        return None
    branch = access.branch(branch_id)
    limits = [role.max_discount_percent for role in branch.roles] if branch else []
    if not limits:
        return Decimal('0')
    if any(limit is None for limit in limits):
        return None
    return max(limits)


def has_permission(user, branch_id, code):
    access = get_access(user)
    if access.is_owner:
        return True
    branch = access.branch(branch_id)
    return bool(branch) and code in branch.permissions


@dataclass
class Need:
    """Something to approve: a check on a user, and what to tell the cashier."""
    allows: Callable  # (user) → bool
    message: str


def approve(needs, *, user, pin, field='approval_pin'):
    """
    None if the cashier may do all of it. Otherwise the manager whose PIN covers every
    need, or a ValidationError on `approval_pin` that says what is needed.
    """
    missing = [n for n in needs if not n.allows(user)]
    if not missing:
        return None
    if not pin:
        raise serializers.ValidationError({field: ' '.join(n.message for n in missing)}, code='approval_required')
    manager = user_with_pin(str(pin).strip())
    if manager is None:
        raise serializers.ValidationError({field: 'Wrong PIN. Try again.'}, code='approval_invalid')
    if not all(n.allows(manager) for n in missing):
        raise serializers.ValidationError({field: f"{manager.full_name} can't approve this."},
                                          code='approval_invalid')
    return manager


def discount_need(percent, branch_id):
    """A discount of `percent` of the order."""
    return Need(
        allows=lambda u: (limit := discount_limit(u, branch_id)) is None or percent <= limit,
        message=f'A {percent.normalize():f}% discount is over your limit: a manager must approve it.',
    )


def paid_order_need(branch_id):
    return Need(
        allows=lambda u: has_permission(u, branch_id, 'payments.edit'),
        message='This order has been paid: a manager must approve the change.',
    )
