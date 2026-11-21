from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import org_permission
from .models import Permission, Role
from .registry import PERMISSION_GROUPS
from .serializers import RoleSerializer

MODULE_ORDER = {module: i for i, (module, _) in enumerate(PERMISSION_GROUPS)}


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.prefetch_related('permissions')
    serializer_class = RoleSerializer
    permission_classes = [org_permission('roles.manage')]

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
    """All permissions (from the permissions table), grouped by module, for the role editor."""
    permission_classes = [org_permission('roles.manage')]

    def get(self, request):
        groups = {}
        for p in Permission.objects.order_by('code'):
            groups.setdefault(p.module, []).append({'code': p.code, 'label': p.description or p.code})
        return Response([
            {'module': module, 'permissions': perms}
            for module, perms in sorted(groups.items(), key=lambda kv: MODULE_ORDER.get(kv[0], 99))
        ])
