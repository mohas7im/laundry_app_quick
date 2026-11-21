from accounts.test_management import PASSWORD, Base, make_role
from accounts.tests import body, error_fields
from .models import Customer

ALL = ['customers.view', 'customers.create', 'customers.edit', 'customers.delete']


class CustomerApiTests(Base):
    """Customers are counter work: permissions come from the ACTIVE branch (access token)."""

    def setUp(self):
        super().setUp()
        self.counter = make_role('Counter', ALL)

    def login(self, user_email, branch=None):
        """Real login, so the access-token cookie carries the branch's permissions."""
        res = self.client.post('/api/auth/login/', {'email': user_email, 'password': PASSWORD,
                                                   'branch_id': str(branch.id) if branch else None}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

    def staff(self, roles):
        self.make_user('cashier@shop.com', roles=roles)
        return 'cashier@shop.com'

    def test_branch_role_can_manage_customers_in_its_branch(self):
        self.login(self.staff([(self.counter, self.dxb)]), self.dxb)
        res = self.client.post('/api/customers/', {'name': ' Fatima ', 'phone': '+971 50-123 4567',
                                                   'notes': 'No starch'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['message'], 'Customer created successfully.')
        created = body(res)
        self.assertEqual(created['name'], 'Fatima')
        self.assertEqual(created['phone'], '+971501234567')        # stored normalised
        self.assertEqual(created['branch'], self.dxb.id)          # registered at the active branch
        self.assertEqual(created['branch_name'], 'Dubai Marina')

        self.assertEqual([c['name'] for c in body(self.client.get('/api/customers/'))], ['Fatima'])
        url = f"/api/customers/{created['id']}/"
        self.assertEqual(self.client.patch(url, {'email': 'F@Mail.com'}, format='json').status_code, 200)
        self.assertEqual(Customer.objects.get().email, 'f@mail.com')
        self.assertEqual(self.client.delete(url).status_code, 200)
        self.assertFalse(Customer.objects.exists())

    def test_permission_only_in_the_branch_it_was_given(self):
        viewer = make_role('Viewer', ['customers.view'])
        email = self.staff([(self.counter, self.dxb), (viewer, self.shj)])

        self.login(email, self.shj)  # only customers.view here
        self.assertEqual(self.client.get('/api/customers/').status_code, 200)
        res = self.client.post('/api/customers/', {'name': 'A', 'phone': '0501234567'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['errors'][0]['error_code'], 'PERMISSION_DENIED')

        self.login(email, self.dxb)
        res = self.client.post('/api/customers/', {'name': 'A', 'phone': '0501234567'}, format='json')
        self.assertEqual(res.status_code, 201)

    def test_no_customer_permission(self):
        self.login(self.staff([(self.cashier, self.dxb)]), self.dxb)  # orders only
        self.assertEqual(self.client.get('/api/customers/').status_code, 403)

    def test_one_list_for_every_branch(self):
        Customer.objects.create(name='Ali', phone='+971500000001', branch=self.shj)
        self.login(self.staff([(self.counter, self.dxb)]), self.dxb)
        self.assertEqual([c['name'] for c in body(self.client.get('/api/customers/'))], ['Ali'])

    def test_validation(self):
        Customer.objects.create(name='Ali', phone='+971500000001', branch=self.dxb)
        self.login(self.staff([(self.counter, self.dxb)]), self.dxb)
        post = lambda **kw: self.client.post('/api/customers/', kw, format='json')  # noqa: E731

        res = post()
        self.assertEqual(error_fields(res), {'name', 'phone'})
        self.assertEqual({e['error_code'] for e in res.data['errors']}, {'REQUIRED'})

        res = post(name='B', phone='+971 50 000 0001')  # same number, other spacing
        self.assertEqual(res.data['errors'][0]['error_code'], 'DUPLICATE')
        self.assertEqual(error_fields(res), {'phone'})

        self.assertEqual(error_fields(post(name='B', phone='12ab')), {'phone'})
        self.assertEqual(error_fields(post(name='B', phone='123')), {'phone'})          # too short
        self.assertEqual(error_fields(post(name='B', phone='0509999999', email='x')), {'email'})

    def test_owner_has_customers_menu(self):
        self.login('owner@shop.com', self.dxb)
        codes = [m['code'] for m in body(self.client.get('/api/menus/my/'))]
        self.assertIn('customers', codes)
        self.assertEqual(self.client.get('/api/customers/').status_code, 200)

    def test_branch_with_customers_cannot_be_deleted(self):
        Customer.objects.create(name='Ali', phone='+971500000001', branch=self.dxb)
        self.as_owner()
        res = self.client.delete(f'/api/branches/{self.dxb.id}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['referenced_tables'], ['customers'])
