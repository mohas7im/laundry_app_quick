from django.db.models import DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.decorators import action

from accounts.access import branch_menu_permission, get_active_branch
from catalogue.models import PriceList
from common.drf import ResultViewSetMixin
from common.results import BaseResult
from .models import Customer
from .preferences import preference_lists
from .serializers import CustomerSerializer


class CustomerViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    """
    /api/customers/ — counter work, so permissions come from the active branch
    (customers.view / create / edit / delete in the access token).
    """

    # balance: what the customer still owes over their orders (not cancelled)
    queryset = Customer.objects.select_related('branch', 'price_list').annotate(balance=Coalesce(
        Sum(F('orders__total') - F('orders__paid_amount'), filter=~Q(orders__status='cancelled')),
        Value(0), output_field=DecimalField(max_digits=10, decimal_places=2)))
    serializer_class = CustomerSerializer
    permission_classes = [branch_menu_permission('customers')]
    search_fields = ['name', 'phone', 'email']
    referenced_message = 'This customer has orders, so they can\'t be deleted.'

    def perform_create(self, serializer):
        serializer.save(branch=get_active_branch(self.request))

    @action(detail=False, methods=['get'])
    def options(self, request):
        """GET /api/customers/options/ — what the customer form offers: price lists and preferences."""
        data = {
            'price_lists': [{'id': str(p.id), 'name': p.name, 'is_default': p.is_default}
                            for p in PriceList.objects.filter(is_active=True)],
            'preferences': preference_lists(),
        }
        return BaseResult.ok(data, 'Customer options retrieved successfully.').to_response()
