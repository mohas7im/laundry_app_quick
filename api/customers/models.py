import uuid

from django.db import models


class Customer(models.Model):
    """
    A laundry customer (table `customers`). One list for the whole business:
    a customer can drop off and collect at any branch. `branch` records where
    they were registered.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    # stored normalised ("+971501234567"): the counter looks customers up by phone
    phone = models.CharField(max_length=20, unique=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True, help_text='e.g. "No starch", "Call before delivery".')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='customers')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customers'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.phone})'
