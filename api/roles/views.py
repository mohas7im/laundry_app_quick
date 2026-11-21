from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import IsOwner
from .models import Role
from .registry import PERMISSION_GROUPS
from .serializers import RoleSerializer


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsOwner]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'This role is assigned to users. Change their role first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class PermissionListView(APIView):
    """All available permissions, grouped by module, for the role editor."""
    permission_classes = [IsOwner]

    def get(self, request):
        return Response([
            {
                'module': group['module'],
                'permissions': [{'code': code, 'label': label} for code, label in group['permissions']],
            }
            for group in PERMISSION_GROUPS
        ])
