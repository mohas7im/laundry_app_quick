"""
JWT issuing. The access token carries the user's access for ONE active branch:

    {
      "sub": "5",
      "is_owner": false,
      "active_branch_id": 2,
      "role": "Cashier",
      "permissions": ["orders.create", "orders.view"],
      "exp": ..., "iat": ..., "jti": ..., "token_type": "access"
    }

Claims are computed from the database whenever tokens are issued: login, refresh
(every 15 min), branch switch and password change. So a role/permission change
by the owner reaches the user within one access-token lifetime.
"""
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from .access import accessible_branches

OWNER_ROLE = 'Owner'


def build_tokens(user, branch_id=None):
    """
    Issue a refresh/access pair for `user`, scoped to `branch_id` if the user can
    access it, otherwise to their first accessible branch (or none).
    Returns (refresh, access, active_branch_or_None).
    """
    branches = accessible_branches(user)
    branch = next((b for b in branches if b.id == branch_id), None) or (branches[0] if branches else None)

    refresh = RefreshToken.for_user(user)
    refresh['is_owner'] = user.is_owner
    refresh['active_branch_id'] = branch.id if branch else None
    refresh['role'] = OWNER_ROLE if user.is_owner else (branch.role.name if branch else None)
    refresh['permissions'] = sorted(branch.permission_set) if branch else []

    # Claims on the refresh token are copied to the access token.
    return refresh, refresh.access_token, branch


def revoke_all_sessions(user):
    """Blacklist every refresh token of `user` (logs them out everywhere within 15 min)."""
    for token in OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False):
        BlacklistedToken.objects.get_or_create(token=token)
