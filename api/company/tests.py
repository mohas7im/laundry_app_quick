import base64

from accounts.test_management import Base, make_role
from accounts.tests import body, error_fields
from .models import CompanySettings

PNG_1PX = 'data:image/png;base64,' + base64.b64encode(
    bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                  '1f15c4890000000d4944415478da6364f8ffbf1e000509020a3c8b6f6b0000000049454e44ae426082')).decode()


class CompanySettingsTests(Base):
    def payload(self, **overrides):
        data = {'name': 'Comfort Laundry', 'logo': PNG_1PX, 'address': 'Shop 4, Samha, Abu Dhabi',
                'phone': '+971 2 555 0101', 'email': 'Info@ComfortLaundry.ae',
                'receipt_footer': 'Not responsible for items left over 45 days.'}
        data.update(overrides)
        return data

    def test_starts_empty_and_everyone_can_read(self):
        staff = self.make_user('staff@shop.com', roles=[(self.cashier, self.dxb)])
        self.client.force_authenticate(staff)
        data = body(self.client.get('/api/company/'))
        self.assertEqual((data['name'], data['logo'], data['receipt_footer']), ('', '', ''))
        self.assertEqual(self.client.put('/api/company/', self.payload(), format='json').status_code, 403)

    def test_owner_saves_settings(self):
        self.as_owner()
        res = self.client.put('/api/company/', self.payload(), format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['message'], 'Company settings saved.')
        saved = body(self.client.get('/api/company/'))
        self.assertEqual((saved['name'], saved['email'], saved['logo'][:22]),
                         ('Comfort Laundry', 'info@comfortlaundry.ae', 'data:image/png;base64,'))
        self.assertEqual(CompanySettings.objects.count(), 1)  # always one record

        # removing the logo
        self.client.put('/api/company/', self.payload(logo=''), format='json')
        self.assertEqual(CompanySettings.current().logo, '')

    def test_validation(self):
        self.as_owner()
        put = lambda **kw: self.client.put('/api/company/', self.payload(**kw), format='json')  # noqa: E731
        self.assertEqual(error_fields(put(name='  ')), {'name'})
        self.assertEqual(error_fields(put(email='not-an-email')), {'email'})
        self.assertEqual(error_fields(put(logo='data:image/svg+xml;base64,PHN2Zz4=')), {'logo'})  # no SVG
        self.assertEqual(error_fields(put(logo='https://example.com/logo.png')), {'logo'})
        big = 'data:image/png;base64,' + base64.b64encode(b'x' * (301 * 1024)).decode()
        self.assertEqual(error_fields(put(logo=big)), {'logo'})

    def test_settings_admin_role(self):
        editor = make_role('Settings editor', ['company.view', 'company.edit'])
        self.client.force_authenticate(self.make_user('ed@shop.com', roles=[(editor, None)]))
        self.assertEqual(self.client.put('/api/company/', self.payload(), format='json').status_code, 200)
