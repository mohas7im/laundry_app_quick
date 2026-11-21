from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import get_access, menu_permission, org_permission
from .models import Action, Menu, Role
from .serializers import MenuSerializer, RolePermissionsSerializer, RoleSerializer


def menu_tree(menus):
    """Menus in display order (parents before children), each with `depth`."""
    children = {}
    for m in menus:
        children.setdefault(m.parent_id, []).append(m)
    ordered = []

    def walk(parent_id, depth):
        for m in sorted(children.get(parent_id, []), key=lambda m: (m.sort_order, m.name)):
            m.depth = depth
            ordered.append(m)
            walk(m.id, depth + 1)

    walk(None, 0)
    return ordered


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    # the users form and the permissions page also need the role list
    permission_classes = [menu_permission('roles', view_also=['users.view', 'permissions.view'])]

    def destroy(self, request, *args, **kwargs):
        if self.get_object().is_system_role:
            return Response({'detail': "Built-in roles can't be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'This role is assigned to users. Change their roles first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class RolePermissionsView(APIView):
    """
    Permissions menu. GET: a role's permission codes (permissions.view).
    PUT {"permissions": [...]}: replace them (permissions.edit).
    """
    permission_classes = [menu_permission('permissions')]

    def get(self, request, role_id):
        role = get_object_or_404(Role, pk=role_id)
        return Response(self._body(role))

    def put(self, request, role_id):
        role = get_object_or_404(Role, pk=role_id)
        serializer = RolePermissionsSerializer(data=request.data, context={'role': role})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._body(role))

    @staticmethod
    def _body(role):
        return {'role': RoleSerializer(role).data, 'permissions': sorted(role.permissions.values_list('code', flat=True))}


class PermissionMatrixView(APIView):
    """
    The permission grid: action columns, and one row per menu in tree order.
    Page rows map each action code to its permission code; group rows have none.
    """
    permission_classes = [org_permission('permissions.view')]

    def get(self, request):
        actions = list(Action.objects.all())
        menus = menu_tree(list(Menu.objects.prefetch_related('permissions__action')))
        return Response({
            'actions': [{'code': a.code, 'name': a.name} for a in actions],
            'menus': [
                {
                    'id': str(m.id), 'code': m.code, 'name': m.name, 'depth': m.depth,
                    'is_header': m.is_header, 'is_sub_header': m.is_sub_header, 'is_active': m.is_active,
                    'permissions': {p.action.code: p.code for p in m.permissions.all()},
                }
                for m in menus
            ],
        })


class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.all()
    serializer_class = MenuSerializer
    permission_classes = [menu_permission('menus')]

    def list(self, request, *args, **kwargs):
        menus = menu_tree(list(self.get_queryset()))
        data = self.get_serializer(menus, many=True).data
        for row, m in zip(data, menus):
            row['depth'] = m.depth
        return Response(data)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().is_system:
            return Response({'detail': "Built-in menus can't be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'detail': 'Move or delete the menus under it first.'}, status=status.HTTP_400_BAD_REQUEST)


class MyMenuView(APIView):
    """
    The sidebar for the current user, in display order: active menus with a link
    whose `<code>.view` permission they have in the active branch (organization-wide
    roles included), plus every menu above them. Headers with nothing visible under
    them are left out.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        access = get_access(request.user)
        token = getattr(request, 'auth', None)
        branch_id = token.get('active_branch_id') if token is not None else None
        active = access.branch(branch_id) if branch_id else None
        have = active.permissions if active else access.org_permissions

        menus = menu_tree(list(Menu.objects.filter(is_active=True)))
        by_id = {m.id: m for m in menus}
        visible = {m.id for m in menus if m.router_link and f'{m.code}.view' in have}
        for menu_id in list(visible):
            parent = by_id.get(by_id[menu_id].parent_id)
            while parent is not None:
                visible.add(parent.id)
                parent = by_id.get(parent.parent_id)

        return Response([
            {
                'id': str(m.id), 'code': m.code, 'name': m.name, 'icon': m.icon,
                'parent': str(m.parent_id) if m.parent_id else None, 'depth': m.depth,
                'is_header': m.is_header, 'is_sub_header': m.is_sub_header, 'router_link': m.router_link,
            }
            for m in menus if m.id in visible
        ])
