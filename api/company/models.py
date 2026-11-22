"""Company settings: one record for the whole business (name, logo, contact details, receipt terms)."""
import uuid

from django.db import models


class CompanySettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120, blank=True)
    # the logo is kept in the database (a data URL, ≤ 300 KB): it survives server redeploys
    # and prints straight onto receipts, with no file storage to set up
    logo = models.TextField(blank=True, help_text='data:image/png;base64,…')
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    receipt_footer = models.TextField(blank=True, help_text='Terms printed at the bottom of every receipt.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'company_settings'

    def __str__(self):
        return self.name or 'Company settings'

    @classmethod
    def current(cls):
        """The one settings record (created empty the first time)."""
        settings = cls.objects.order_by('id').first()
        return settings or cls.objects.create()
