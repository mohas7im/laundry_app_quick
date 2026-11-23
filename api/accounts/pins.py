"""
Approval PINs: a manager types theirs at the counter to approve something the cashier
may not do alone (a discount over their role's limit, a change to a paid order).

The PIN is kept as an HMAC (SECRET_KEY + the user's id + the PIN): checking it is fast
enough to try every user's PIN (a PIN alone says who is approving), and the stored value
is useless without the server's secret key.
"""
import hashlib
import hmac
import re

from django.conf import settings

PIN_RE = re.compile(r'^\d{4,6}$')


def hash_pin(user_id, pin: str) -> str:
    message = f'{user_id}:{pin}'.encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def pin_matches(user, pin: str) -> bool:
    return bool(user.pin_hash) and hmac.compare_digest(user.pin_hash, hash_pin(user.id, pin))


def user_with_pin(pin: str, exclude=None):
    """The active user whose PIN this is, or None."""
    from .models import User

    users = User.objects.filter(is_active=True).exclude(pin_hash='')
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
    return next((u for u in users if pin_matches(u, pin)), None)
