from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from accounts.access import menu_permission
from .models import Branch
from .serializers import BranchSerializer


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    # users form also needs the branch list
    permission_classes = [menu_permission('branches', view_also=['users.view'])]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'This branch has staff assigned. Remove them or deactivate the branch instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
