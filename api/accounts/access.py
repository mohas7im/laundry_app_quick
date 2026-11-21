"""
Access control.

The client sends the branch it is working in with every request:
    X-Branch-ID: <branch id>

- IsOwner                       → owner-only endpoints (branches, roles, users)
- branch_permission('orders.create') → user must have that permission in the active branch
- get_active_branch(request)    → the Branch for this request (validated), for filtering data
"""
from rest_framework import exceptions, permissions

from branches.models import Branch, BranchMembership
from roles.registry import ALL_PERMISSIONS

BRANCH_HEADER = 'HTTP_X_BRANCH_ID'


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


def get_active_branch(request):
    """
    Resolve and cache the branch from the X-Branch-ID header.
    Raises 400 if missing/invalid, 403 if the user has no access to it.
    """
    if hasattr(request, '_active_branch'):
        return request._active_branch

    raw = request.META.get(BRANCH_HEADER)
    if not raw:
        raise exceptions.ValidationError({'detail': 'Select a branch (X-Branch-ID header missing).'})
    try:
        branch_id = int(raw)
    except ValueError:
        raise exceptions.ValidationError({'detail': 'Invalid X-Branch-ID header.'})

    branch = next((b for b in accessible_branches(request.user) if b.id == branch_id), None)
    if branch is None:
        raise exceptions.PermissionDenied('You do not have access to this branch.')

    request._active_branch = branch
    return branch


class IsOwner(permissions.BasePermission):
    message = 'Only the owner can do this.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_owner)


def branch_permission(*codes):
    """Permission class: user needs ALL `codes` in the active branch. Owners always pass."""
    unknown = set(codes) - ALL_PERMISSIONS
    if unknown:
        raise ValueError(f'Unknown permission codes: {unknown}')

    class HasBranchPermission(permissions.BasePermission):
        message = 'You do not have permission to do this in this branch.'

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            branch = get_active_branch(request)
            return set(codes) <= branch.permission_set

    HasBranchPermission.__name__ = f'HasBranchPermission({", ".join(codes)})'
    return HasBranchPermission
