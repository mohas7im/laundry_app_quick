"""
JWT issuing. The access token carries the user's access for ONE active branch:

    {
      "sub": "<user uuid>",
      "is_owner": false,
      "active_branch_id": "<branch uuid>",
      "roles": ["Cashier"],
      "permissions": ["orders.create", "orders.view"],
      "exp": ..., "iat": ..., "jti": ..., "token_type": "access"
    }

Claims are computed from the RBAC tables whenever tokens are issued: login,
refresh (every 15 min), branch switch and password change. So a role/permission
change reaches the user within one access-token lifetime.
"""
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from .access import get_access


def build_tokens(user, branch_id=None):
    """
    Issue a refresh/access pair for `user`, scoped to `branch_id` if the user can
    access it, otherwise to their first accessible branch (or none).
    Returns (refresh, access, access_info, active BranchAccess or None).
    """
    access = get_access(user)
    active = (access.branch(branch_id) if branch_id else None) or (access.branches[0] if access.branches else None)

    refresh = RefreshToken.for_user(user)
    refresh['is_owner'] = access.is_owner
    refresh['active_branch_id'] = str(active.branch.id) if active else None
    if active:
        refresh['roles'] = sorted({role.name for role in active.roles})
        refresh['permissions'] = sorted(active.permissions)
    else:
        refresh['roles'] = sorted({role.name for role in access.org_roles})
        refresh['permissions'] = sorted(access.org_permissions)

    # Claims on the refresh token are copied to the access token.
    return refresh, refresh.access_token, access, active


def revoke_all_sessions(user):
    """Blacklist every refresh token of `user` (logs them out everywhere within 15 min)."""
    for token in OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False):
        BlacklistedToken.objects.get_or_create(token=token)
