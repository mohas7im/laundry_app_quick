"""
Access control.

The active branch, role and permissions are claims in the access token
(see accounts/tokens.py), so permission checks need no database query:

- IsOwner                            → owner-only endpoints (branches, roles, users)
- branch_permission('orders.create') → token must contain that permission
- get_active_branch_id(request)      → branch id from the token, for filtering data
- get_active_branch(request)         → the Branch object (one query), when you need its fields
"""
from rest_framework import exceptions, permissions

from branches.models import Branch, BranchMembership
from roles.registry import ALL_PERMISSIONS


def accessible_branches(user):
    """Active branches the user can work in, each annotated with `.role` and `.permission_set`."""
    if user.is_owner:
        branches = list(Branch.objects.filter(is_active=True))
        for branch in branches:
            branch.role = None
            branch.permission_set = ALL_PERMISSIONS
        return branches

    memberships = (
        BranchMembership.objects
        .filter(user=user, branch__is_active=True)
        .select_related('branch', 'role')
    )
    branches = []
    for m in memberships:
        branch = m.branch
        branch.role = m.role
        branch.permission_set = frozenset(m.role.permissions)
        branches.append(branch)
    return branches


def _claims(request):
    token = getattr(request, 'auth', None)
    if token is None:
        raise exceptions.NotAuthenticated()
    return token


def get_active_branch_id(request):
    """The branch this request works in, from the access token. 400 if the user has none."""
    branch_id = _claims(request).get('active_branch_id')
    if not branch_id:
        raise exceptions.ValidationError({'detail': 'No active branch. Ask the owner to assign you a branch.'})
    return branch_id


def get_active_branch(request):
    """The active Branch object (cached per request)."""
    if not hasattr(request, '_active_branch'):
        branch = Branch.objects.filter(pk=get_active_branch_id(request), is_active=True).first()
        if branch is None:
            raise exceptions.PermissionDenied('This branch is no longer active.')
        request._active_branch = branch
    return request._active_branch


def token_permissions(request):
    return frozenset(_claims(request).get('permissions', ()))


class IsOwner(permissions.BasePermission):
    message = 'Only the owner can do this.'

    def has_permission(self, request, view):
        # Read from the user row, not the token: owner status is too powerful to trust a stale claim.
        return bool(request.user and request.user.is_authenticated and request.user.is_owner)


def branch_permission(*codes):
    """Permission class: the access token must contain ALL `codes` for the active branch."""
    unknown = set(codes) - ALL_PERMISSIONS
    if unknown:
        raise ValueError(f'Unknown permission codes: {unknown}')

    class HasBranchPermission(permissions.BasePermission):
        message = 'You do not have permission to do this in this branch.'

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            get_active_branch_id(request)  # 400 if the user has no branch
            return set(codes) <= token_permissions(request)

    HasBranchPermission.__name__ = f'HasBranchPermission({", ".join(codes)})'
    return HasBranchPermission
