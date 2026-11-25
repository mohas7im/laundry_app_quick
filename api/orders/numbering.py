"""Invoice numbers for new orders, in the format chosen on the Configuration page."""
from company.models import CompanySettings
from .models import BranchOrderCounter, Order


def next_order_number(branch):
    """
    The next free invoice number. Call inside the order's transaction: the counter row
    stays locked until it commits, so two orders never get the same number.

    - one sequence (company): 3001, 3002, ... shared by every branch
    - per branch: KC33-00001, DXB1-00001, ... (the branch code keeps them apart)

    A number already taken (switching formats, or the next number set back by hand) is
    skipped instead of failing the order.
    """
    settings = CompanySettings.current()
    if settings.invoice_numbering == CompanySettings.InvoiceNumbering.COMPANY:
        counter = CompanySettings.objects.select_for_update().get(pk=settings.pk)
        field, fmt = 'last_invoice_number', str
    else:
        counter, _ = BranchOrderCounter.objects.select_for_update().get_or_create(branch=branch)
        field, fmt = 'last_number', lambda n: f'{branch.code}-{n:05d}'

    n = getattr(counter, field) + 1
    while Order.objects.filter(number=fmt(n)).exists():
        n += 1
    setattr(counter, field, n)
    counter.save(update_fields=[field])
    return fmt(n)
