"""
Access control, from the RBAC tables:

    users ─< user_roles >─ roles ─< role_permissions >─ permissions
                 │ branch_id NULL = organization-wide, else that branch only
    users ─< user_branch_assignments >─ branches

Permissions are "<menu code>.<action>" (see the menus table).

- get_access(user)                   → the user's branches, roles and permissions (DB)
- menu_permission('branches')        → admin API: GET needs branches.view, POST .create,
                                       PUT/PATCH .edit, DELETE .delete (org-wide roles, DB)
- org_permission('users.reset')      → one specific organization-level permission (DB)
- branch_permission('orders.create') → permission class for branch work (access-token claims)
- get_active_branch_id(request)      → branch id from the token, for filtering data
"""
from dataclasses import dataclass, field

from rest_framework import exceptions, permissions

from branches.models import Branch
from roles.models import Permission, RolePermission, UserRole


@dataclass
class BranchAccess:
    branch: Branch
    roles: list          # Role objects that apply here (org-wide + this branch)
    permissions: frozenset


@dataclass
class Access:
    is_owner: bool
    org_roles: list                      # organization-wide Role objects
    org_permissions: frozenset           # from organization-wide roles
    branches: list = field(default_factory=list)  # [BranchAccess], active branches only

    def branch(self, branch_id):
        return next((b for b in self.branches if str(b.branch.id) == str(branch_id)), None)


def get_access(user):
    """Everything the user may do, per branch. ~3 queries."""
    rows = list(UserRole.objects.filter(user=user).select_related('role', 'branch'))
    role_ids = {r.role_id for r in rows}

    perms_by_role = {}
    for role_id, code in RolePermission.objects.filter(role_id__in=role_ids).values_list(
        'role_id', 'permission__code'
    ):
        perms_by_role.setdefault(role_id, set()).add(code)

    org_roles = [r.role for r in rows if r.branch_id is None]
    is_owner = any(role.is_owner_role for role in org_roles)
    every_permission = frozenset(Permission.objects.values_list('code', flat=True)) if is_owner else None

    def union(roles):
        if is_owner:
            return every_permission
        return frozenset().union(*(perms_by_role.get(role.id, ()) for role in roles))

    org_permissions = union(org_roles)

    branch_roles = {}
    for r in rows:
        if r.branch_id is not None:
            branch_roles.setdefault(r.branch_id, []).append(r.role)

    # Organization-wide roles apply in every branch; otherwise only assigned branches.
    if org_roles:
        branches = Branch.objects.filter(is_active=True)
    else:
        branches = Branch.objects.filter(is_active=True, assignments__user=user)

    branch_access = []
    for branch in branches:
        roles = org_roles + branch_roles.get(branch.id, [])
        branch_access.append(BranchAccess(branch=branch, roles=roles, permissions=union(roles)))

    return Access(is_owner=is_owner, org_roles=org_roles, org_permissions=org_permissions,
                  branches=branch_access)


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


def org_permission(*codes):
    """
    Permission class for organization-level actions (branches, roles, users).
    Checked against the database, not the token: these are too powerful to trust a stale claim.
    Only organization-wide roles count.
    """

    class HasOrgPermission(permissions.BasePermission):
        message = 'You do not have permission to do this.'

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            if not hasattr(request, '_access'):
                request._access = get_access(request.user)
            return set(codes) <= request._access.org_permissions

    HasOrgPermission.__name__ = f'HasOrgPermission({", ".join(codes)})'
    return HasOrgPermission


def branch_permission(*codes):
    """Permission class for branch work: the access token must contain ALL `codes`."""

    class HasBranchPermission(permissions.BasePermission):
        message = 'You do not have permission to do this in this branch.'

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            get_active_branch_id(request)  # 400 if the user has no branch
            return set(codes) <= frozenset(_claims(request).get('permissions', ()))

    HasBranchPermission.__name__ = f'HasBranchPermission({", ".join(codes)})'
    return HasBranchPermission


METHOD_ACTIONS = {
    'GET': 'view', 'HEAD': 'view', 'OPTIONS': 'view',
    'POST': 'create', 'PUT': 'edit', 'PATCH': 'edit', 'DELETE': 'delete',
}


def menu_permission(menu_code, view_also=()):
    """
    Permission class for an admin page's API, from its menu's actions.
    `view_also`: other permissions that may read (GET) this data, e.g. the users
    form needs the branch and role lists: menu_permission('roles', view_also=['users.view']).
    Organization-wide roles only, checked in the database.
    """

    class HasMenuPermission(permissions.BasePermission):
        message = 'You do not have permission to do this.'

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            if not hasattr(request, '_access'):
                request._access = get_access(request.user)
            have = request._access.org_permissions
            action = METHOD_ACTIONS.get(request.method)
            if f'{menu_code}.{action}' in have:
                return True
            return action == 'view' and any(code in have for code in view_also)

    HasMenuPermission.__name__ = f'HasMenuPermission({menu_code})'
    return HasMenuPermission
