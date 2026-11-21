from rest_framework import viewsets

from accounts.access import branch_menu_permission, get_active_branch
from common.drf import ResultViewSetMixin
from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    """
    /api/customers/ — counter work, so permissions come from the active branch
    (customers.view / create / edit / delete in the access token).
    """

    queryset = Customer.objects.select_related('branch')
    serializer_class = CustomerSerializer
    permission_classes = [branch_menu_permission('customers')]
    referenced_message = 'This customer has orders, so they can\'t be deleted.'

    def perform_create(self, serializer):
        serializer.save(branch=get_active_branch(self.request))
