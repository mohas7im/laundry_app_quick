from django.db.models import ProtectedError
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import get_access, menu_permission, org_permission
from .models import Menu, Role
from .registry import action_label
from .serializers import MenuSerializer, RoleSerializer


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
    queryset = Role.objects.prefetch_related('permissions')
    serializer_class = RoleSerializer
    # users form also needs the role list
    permission_classes = [menu_permission('roles', view_also=['users.view'])]

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


class PermissionListView(APIView):
    """Menus in tree order, each with its permissions: the rows of the role editor's grid."""
    permission_classes = [org_permission('roles.view')]

    def get(self, request):
        menus = menu_tree(list(Menu.objects.prefetch_related('permissions')))
        return Response([
            {
                'menu': {'id': str(m.id), 'code': m.code, 'name': m.name, 'depth': m.depth, 'is_active': m.is_active},
                'permissions': [
                    {'code': p.code, 'action': p.action, 'label': action_label(p.action)}
                    for p in m.permissions.all()
                ],
            }
            for m in menus
        ])


class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.prefetch_related('permissions')
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
    The sidebar for the current user: active menus whose `<code>.view` permission they
    have in the active branch (organization-wide roles included). A group heading
    (no path) is shown when at least one menu under it is shown.
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
        visible = {m.id for m in menus if m.path and f'{m.code}.view' in have}
        for menu_id in list(visible):  # show the headings above visible menus
            parent = by_id.get(by_id[menu_id].parent_id)
            while parent is not None:
                visible.add(parent.id)
                parent = by_id.get(parent.parent_id)

        return Response([
            {'id': str(m.id), 'code': m.code, 'name': m.name, 'path': m.path, 'icon': m.icon,
             'parent': str(m.parent_id) if m.parent_id else None, 'depth': m.depth}
            for m in menus if m.id in visible
        ])
