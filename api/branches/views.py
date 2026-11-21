from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from accounts.access import IsOwner
from .models import Branch
from .serializers import BranchSerializer


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = [IsOwner]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'This branch has users assigned. Remove them or deactivate the branch instead.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
