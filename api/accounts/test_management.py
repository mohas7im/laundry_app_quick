from django.core.cache import cache
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from branches.models import Branch, BranchMembership
from roles.models import Role
from .access import branch_permission
from .models import User
from .tokens import build_tokens

PASSWORD = 'Str0ng-pass-123'


class Base(APITestCase):
    def setUp(self):
        cache.clear()  # reset the login rate limit between tests
        self.owner = User.objects.create_owner(email='owner@shop.com', password=PASSWORD, full_name='Owner')
        self.dxb = Branch.objects.create(name='Dubai Marina', code='DXB1')
        self.shj = Branch.objects.create(name='Sharjah', code='SHJ1')
        self.cashier = Role.objects.create(name='Cashier', permissions=['orders.view', 'orders.create'])
        self.manager = Role.objects.create(name='Manager', permissions=['orders.view', 'orders.create', 'orders.delete'])

    def as_owner(self):
        self.client.force_authenticate(self.owner)

    def make_staff(self, email='staff@shop.com', memberships=()):
        user = User.objects.create_user(email=email, password=PASSWORD, full_name='Staff')
        for branch, role in memberships:
            BranchMembership.objects.create(user=user, branch=branch, role=role)
        return user


class BranchTests(Base):
    def test_owner_crud(self):
        self.as_owner()
        res = self.client.post('/api/branches/', {'name': 'Abu Dhabi', 'code': 'auh-1'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['code'], 'AUH-1')
        bid = res.data['id']

        self.assertEqual(len(self.client.get('/api/branches/').data), 3)
        res = self.client.patch(f'/api/branches/{bid}/', {'is_active': False}, format='json')
        self.assertFalse(res.data['is_active'])
        self.assertEqual(self.client.delete(f'/api/branches/{bid}/').status_code, 204)

    def test_duplicate_name_and_code_rejected(self):
        self.as_owner()
        res = self.client.post('/api/branches/', {'name': 'dubai marina', 'code': 'dxb1'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('name', res.data)
        self.assertIn('code', res.data)

    def test_cannot_delete_branch_with_users(self):
        self.make_staff(memberships=[(self.dxb, self.cashier)])
        self.as_owner()
        res = self.client.delete(f'/api/branches/{self.dxb.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('deactivate', res.data['detail'])

    def test_staff_cannot_manage(self):
        self.client.force_authenticate(self.make_staff(memberships=[(self.dxb, self.manager)]))
        self.assertEqual(self.client.get('/api/branches/').status_code, 403)
        self.assertEqual(self.client.get('/api/roles/').status_code, 403)
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        self.assertEqual(self.client.get('/api/permissions/').status_code, 403)

    def test_anonymous_gets_401(self):
        self.assertEqual(self.client.get('/api/branches/').status_code, 401)


class RoleTests(Base):
    def test_create_with_permissions(self):
        self.as_owner()
        res = self.client.post('/api/roles/', {
            'name': 'Ironing', 'permissions': ['orders.view', 'orders.update_status', 'orders.view'],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['permissions'], ['orders.update_status', 'orders.view'])

    def test_unknown_permission_rejected(self):
        self.as_owner()
        res = self.client.post('/api/roles/', {'name': 'Hacker', 'permissions': ['everything.all']}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('permissions', res.data)

    def test_duplicate_name_case_insensitive(self):
        self.as_owner()
        res = self.client.post('/api/roles/', {'name': 'cashier', 'permissions': []}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_cannot_delete_role_in_use(self):
        self.make_staff(memberships=[(self.dxb, self.cashier)])
        self.as_owner()
        self.assertEqual(self.client.delete(f'/api/roles/{self.cashier.id}/').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/roles/{self.manager.id}/').status_code, 204)

    def test_permission_list_grouped(self):
        self.as_owner()
        res = self.client.get('/api/permissions/')
        self.assertEqual(res.status_code, 200)
        orders = next(g for g in res.data if g['module'] == 'Orders')
        self.assertIn({'code': 'orders.create', 'label': 'Create orders'}, orders['permissions'])


class StaffUserTests(Base):
    def payload(self, **overrides):
        data = {
            'email': 'New@Shop.com', 'full_name': 'New Staff', 'phone': '050', 'password': PASSWORD,
            'memberships': [
                {'branch': self.dxb.id, 'role': self.manager.id},
                {'branch': self.shj.id, 'role': self.cashier.id},
            ],
        }
        data.update(overrides)
        return data

    def test_create_user_in_two_branches_with_different_roles(self):
        self.as_owner()
        res = self.client.post('/api/users/', self.payload(), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['email'], 'new@shop.com')
        self.assertNotIn('password', res.data)
        roles = {m['branch_name']: m['role_name'] for m in res.data['memberships']}
        self.assertEqual(roles, {'Dubai Marina': 'Manager', 'Sharjah': 'Cashier'})

        user = User.objects.get(email='new@shop.com')
        self.assertFalse(user.is_owner)
        self.assertTrue(user.check_password(PASSWORD))

    def test_validation(self):
        self.as_owner()
        cases = {
            'memberships': self.payload(memberships=[]),
            'password': self.payload(password='123'),
        }
        for field, data in cases.items():
            res = self.client.post('/api/users/', data, format='json')
            self.assertEqual(res.status_code, 400, field)
            self.assertIn(field, res.data)

        dup = self.payload(memberships=[{'branch': self.dxb.id, 'role': self.cashier.id}] * 2)
        self.assertEqual(self.client.post('/api/users/', dup, format='json').status_code, 400)

        no_pw = self.payload()
        no_pw.pop('password')
        self.assertIn('password', self.client.post('/api/users/', no_pw, format='json').data)

    def test_update_replaces_memberships_and_keeps_password(self):
        staff = self.make_staff(memberships=[(self.dxb, self.cashier)])
        self.as_owner()
        res = self.client.patch(f'/api/users/{staff.id}/', {
            'memberships': [{'branch': self.shj.id, 'role': self.manager.id}],
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([m['branch_name'] for m in res.data['memberships']], ['Sharjah'])
        staff.refresh_from_db()
        self.assertTrue(staff.check_password(PASSWORD))

    def test_owner_accounts_not_listed_or_editable(self):
        self.make_staff()
        self.as_owner()
        emails = [u['email'] for u in self.client.get('/api/users/').data]
        self.assertEqual(emails, ['staff@shop.com'])
        self.assertEqual(self.client.get(f'/api/users/{self.owner.id}/').status_code, 404)

    def test_deactivated_user_cannot_login(self):
        staff = self.make_staff(memberships=[(self.dxb, self.cashier)])
        self.as_owner()
        self.client.patch(f'/api/users/{staff.id}/', {'is_active': False}, format='json')
        self.client.force_authenticate(None)
        res = self.client.post('/api/auth/login/', {'email': 'staff@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(res.status_code, 400)


class MeAndAccessTests(Base):
    def test_me_for_staff_lists_only_their_active_branches(self):
        inactive = Branch.objects.create(name='Closed', code='OLD', is_active=False)
        staff = self.make_staff(memberships=[(self.dxb, self.cashier), (inactive, self.manager)])
        self.client.force_authenticate(staff)
        res = self.client.get('/api/auth/me/')
        self.assertFalse(res.data['is_owner'])
        self.assertEqual(len(res.data['branches']), 1)
        b = res.data['branches'][0]
        self.assertEqual((b['code'], b['role']['name']), ('DXB1', 'Cashier'))
        self.assertEqual(b['permissions'], ['orders.create', 'orders.view'])

    def test_me_for_owner_has_all_branches_and_permissions(self):
        self.as_owner()
        res = self.client.get('/api/auth/me/')
        self.assertTrue(res.data['is_owner'])
        self.assertEqual({b['code'] for b in res.data['branches']}, {'DXB1', 'SHJ1'})
        self.assertIn('reports.view', res.data['branches'][0]['permissions'])

    def test_branch_permission_class(self):
        class DeleteOrder(APIView):
            permission_classes = [IsAuthenticated, branch_permission('orders.delete')]

            def post(self, request):
                return Response('ok')

        view = DeleteOrder.as_view()
        factory = APIRequestFactory()
        staff = self.make_staff(memberships=[(self.dxb, self.cashier), (self.shj, self.manager)])

        def call(user, branch_id=None):
            _, access, _ = build_tokens(user, branch_id)
            req = factory.post('/x/')
            force_authenticate(req, user, token=access)
            return view(req).status_code

        self.assertEqual(call(staff, self.dxb.id), 403)   # cashier in Dubai: no delete
        self.assertEqual(call(staff, self.shj.id), 200)   # manager in Sharjah: can delete
        other = Branch.objects.create(name='Other', code='OTH')
        self.assertEqual(call(self.owner, other.id), 200) # owner: everything
        self.assertEqual(call(self.make_staff('nobranch@shop.com')), 400)  # no branch at all


class TokenClaimTests(Base):
    """Role and permissions live in the access token, scoped to the active branch."""

    def setUp(self):
        super().setUp()
        self.staff = self.make_staff(memberships=[(self.dxb, self.cashier), (self.shj, self.manager)])

    def login(self, **extra):
        return self.client.post('/api/auth/login/', {'email': 'staff@shop.com', 'password': PASSWORD, **extra},
                                format='json')

    def access_claims(self):
        return dict(AccessToken(self.client.cookies['access_token'].value).payload)

    def test_login_puts_branch_role_permissions_in_access_token(self):
        res = self.login()
        claims = self.access_claims()
        self.assertEqual(claims['sub'], str(self.staff.id))
        self.assertFalse(claims['is_owner'])
        self.assertEqual(claims['active_branch_id'], self.dxb.id)   # first branch by name
        self.assertEqual(claims['role'], 'Cashier')
        self.assertEqual(claims['permissions'], ['orders.create', 'orders.view'])
        self.assertEqual(res.data['user']['active_branch_id'], self.dxb.id)

    def test_login_with_preferred_branch(self):
        self.login(branch_id=self.shj.id)
        claims = self.access_claims()
        self.assertEqual((claims['active_branch_id'], claims['role']), (self.shj.id, 'Manager'))

    def test_login_ignores_inaccessible_preferred_branch(self):
        other = Branch.objects.create(name='Other', code='OTH')
        self.login(branch_id=other.id)
        self.assertEqual(self.access_claims()['active_branch_id'], self.dxb.id)

    def test_owner_token(self):
        self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': PASSWORD}, format='json')
        claims = self.access_claims()
        self.assertTrue(claims['is_owner'])
        self.assertEqual(claims['role'], 'Owner')
        self.assertIn('reports.view', claims['permissions'])

    def test_switch_branch_issues_new_token(self):
        self.login()
        old_refresh = self.client.cookies['refresh_token'].value
        csrf = self.client.cookies['csrftoken'].value
        res = self.client.post('/api/auth/switch-branch/', {'branch_id': self.shj.id}, format='json',
                               HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['user']['active_branch_id'], self.shj.id)
        claims = self.access_claims()
        self.assertEqual((claims['active_branch_id'], claims['role']), (self.shj.id, 'Manager'))
        self.assertIn('orders.delete', claims['permissions'])
        self.assertEqual(self.client.get('/api/auth/me/').data['active_branch_id'], self.shj.id)

        # the previous refresh token was revoked
        self.client.cookies['refresh_token'] = old_refresh
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 401)

    def test_switch_to_branch_without_access_is_forbidden(self):
        self.login()
        other = Branch.objects.create(name='Other', code='OTH')
        res = self.client.post('/api/auth/switch-branch/', {'branch_id': other.id}, format='json',
                               HTTP_X_CSRFTOKEN=self.client.cookies['csrftoken'].value)
        self.assertEqual(res.status_code, 403)

    def test_refresh_recomputes_permissions_from_database(self):
        self.login()
        self.cashier.permissions = ['orders.view', 'customers.view']
        self.cashier.save()
        self.assertEqual(self.access_claims()['permissions'], ['orders.create', 'orders.view'])  # stale until refresh

        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 200)
        self.assertEqual(self.access_claims()['permissions'], ['customers.view', 'orders.view'])

    def test_refresh_moves_user_off_a_branch_they_lost(self):
        self.login(branch_id=self.shj.id)
        BranchMembership.objects.filter(user=self.staff, branch=self.shj).delete()
        self.client.post('/api/auth/refresh/')
        claims = self.access_claims()
        self.assertEqual((claims['active_branch_id'], claims['role']), (self.dxb.id, 'Cashier'))

    def test_refresh_rejected_for_deactivated_user(self):
        self.login()
        self.staff.is_active = False
        self.staff.save()
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 401)
