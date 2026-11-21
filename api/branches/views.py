from rest_framework import viewsets

from accounts.access import menu_permission
from common.drf import ResultViewSetMixin
from .models import Branch
from .serializers import BranchSerializer


class BranchViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    # the users form also needs the branch list
    permission_classes = [menu_permission('branches', view_also=['users.view'])]
    referenced_message = 'This branch has staff assigned. Remove them or deactivate the branch instead.'
