from django.db import transaction
from orders.models import Order, BranchOrderCounter
from customers.models import Customer
from catalogue.models import Service
from branches.models import Branch
with transaction.atomic():
    test = Customer.objects.filter(phone='+971500000099').first()
    if test:
        for o in Order.objects.filter(customer=test):
            o.delete()
        test.delete()
    if not Order.objects.exists():
        BranchOrderCounter.objects.filter(branch__code='KC33').update(last_number=0)
    order = {'wash laundry': 1, 'dry cleaning': 2, 'pressed / ironed': 3, 'repairs': 4}
    for s in Service.objects.all():
        s.sort_order = order.get(s.name.lower(), 9); s.save(update_fields=['sort_order'])
print('orders:', Order.objects.count(), 'customers:', Customer.objects.count(), 'services:', list(Service.objects.order_by('sort_order').values_list('name', flat=True)))
