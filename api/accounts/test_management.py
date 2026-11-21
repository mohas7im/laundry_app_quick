from django.core.cache import cache
from django.db import IntegrityError, transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from branches.models import Branch, UserBranchAssignment
from roles.models import Permission, Role, RolePermission, UserRole
from roles.seed import ensure_owner_role
from .access import branch_permission, get_access
from .models import User
from .tokens import build_tokens

PASSWORD = 'Str0ng-pass-123'


def make_role(name, codes):
    role = Role.objects.create(name=name)
    RolePermission.objects.bulk_create(
        RolePermission(role=role, permission=p) for p in Permission.objects.filter(code__in=codes)
    )
    return role


class Base(APITestCase):
    def setUp(self):
        cache.clear()  # reset the login rate limit between tests
        self.owner_role = ensure_owner_role(Role, RolePermission, Permission)
        self.owner = User.objects.create_user(email='owner@shop.com', password=PASSWORD, full_name='Owner')
        UserRole.objects.create(user=self.owner, role=self.owner_role)

        self.dxb = Branch.objects.create(name='Dubai Marina', code='DXB1')
        self.shj = Branch.objects.create(name='Sharjah', code='SHJ1')
        self.cashier = make_role('Cashier', ['orders.view', 'orders.create'])
        self.manager = make_role('Branch Manager', ['orders.view', 'orders.create', 'orders.delete'])
        self.admin = make_role('Admin', ['branches.manage', 'users.manage', 'roles.manage'])

    def as_owner(self):
        self.client.force_authenticate(self.owner)

    def make_user(self, email='staff@shop.com', roles=()):
        """roles: [(role, branch_or_None)]"""
        user = User.objects.create_user(email=email, password=PASSWORD, full_name='Staff')
        for role, branch in roles:
            if branch is not None:
                UserBranchAssignment.objects.get_or_create(user=user, branch=branch)
            UserRole.objects.create(user=user, role=role, branch=branch)
        return user


class SchemaRuleTests(Base):
    """Rules enforced by the database itself."""

    def test_branch_role_requires_branch_assignment(self):
        user = self.make_user()
        with self.assertRaises(IntegrityError), transaction.atomic():
            UserRole.objects.create(user=user, role=self.cashier, branch=self.dxb)

    def test_no_duplicate_org_wide_role(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            UserRole.objects.create(user=self.owner, role=self.owner_role, branch=None)

    def test_removing_assignment_removes_branch_roles(self):
        user = self.make_user(roles=[(self.cashier, self.dxb), (self.manager, self.shj)])
        UserBranchAssignment.objects.filter(user=user, branch=self.shj).delete()
        self.assertEqual(list(user.user_roles.values_list('branch__code', flat=True)), ['DXB1'])

    def test_permissions_table_loaded(self):
        self.assertEqual(Permission.objects.count(), 21)


class AccessTests(Base):
    def test_branch_roles_only_apply_in_their_branch(self):
        user = self.make_user(roles=[(self.cashier, self.dxb), (self.manager, self.shj)])
        access = get_access(user)
        self.assertEqual({b.branch.code for b in access.branches}, {'DXB1', 'SHJ1'})
        self.assertNotIn('orders.delete', access.branch(self.dxb.id).permissions)
        self.assertIn('orders.delete', access.branch(self.shj.id).permissions)
        self.assertEqual(access.org_permissions, frozenset())

    def test_multiple_roles_in_one_branch_are_combined(self):
        reports = make_role('Reports', ['reports.view'])
        user = self.make_user(roles=[(self.cashier, self.dxb), (reports, self.dxb)])
        self.assertTrue({'orders.create', 'reports.view'} <= get_access(user).branch(self.dxb.id).permissions)

    def test_org_wide_role_applies_in_every_branch(self):
        user = self.make_user(roles=[(self.admin, None), (self.cashier, self.dxb)])
        access = get_access(user)
        self.assertEqual(len(access.branches), 2)                       # all active branches
        self.assertIn('users.manage', access.branch(self.shj.id).permissions)
        self.assertIn('orders.create', access.branch(self.dxb.id).permissions)
        self.assertNotIn('orders.create', access.branch(self.shj.id).permissions)

    def test_owner_has_every_permission(self):
        access = get_access(self.owner)
        self.assertTrue(access.is_owner)
        self.assertEqual(access.org_permissions, frozenset(Permission.objects.values_list('code', flat=True)))

    def test_inactive_branch_is_hidden(self):
        user = self.make_user(roles=[(self.cashier, self.dxb)])
        self.dxb.is_active = False
        self.dxb.save()
        self.assertEqual(get_access(user).branches, [])


class BranchApiTests(Base):
    def test_owner_crud(self):
        self.as_owner()
        res = self.client.post('/api/branches/', {'name': 'Abu Dhabi', 'code': 'auh-1'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['code'], 'AUH-1')
        bid = res.data['id']
        self.assertEqual(len(self.client.get('/api/branches/').data), 3)
        self.assertFalse(self.client.patch(f'/api/branches/{bid}/', {'is_active': False}, format='json').data['is_active'])
        self.assertEqual(self.client.delete(f'/api/branches/{bid}/').status_code, 204)

    def test_cannot_delete_branch_with_staff(self):
        self.make_user(roles=[(self.cashier, self.dxb)])
        self.as_owner()
        res = self.client.delete(f'/api/branches/{self.dxb.id}/')
        self.assertEqual(res.status_code, 400)

    def test_admin_role_can_manage_branch_staff_cannot(self):
        admin = self.make_user('admin@shop.com', roles=[(self.admin, None)])
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/branches/').status_code, 200)

        staff = self.make_user(roles=[(self.manager, self.dxb)])
        self.client.force_authenticate(staff)
        for url in ('/api/branches/', '/api/roles/', '/api/users/', '/api/permissions/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_branch_scoped_admin_permission_does_not_count(self):
        # users.manage given only inside one branch must not unlock organization-level APIs
        user = self.make_user(roles=[(self.admin, self.dxb)])
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/users/').status_code, 403)


class RoleApiTests(Base):
    def test_create_with_permissions(self):
        self.as_owner()
        res = self.client.post('/api/roles/', {
            'name': 'Ironing', 'permissions': ['orders.view', 'orders.update_status', 'orders.view'],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['permissions'], ['orders.update_status', 'orders.view'])
        self.assertFalse(res.data['is_system_role'])
        self.assertEqual(RolePermission.objects.filter(role_id=res.data['id']).count(), 2)

    def test_unknown_permission_and_duplicate_name(self):
        self.as_owner()
        self.assertEqual(self.client.post('/api/roles/', {'name': 'X', 'permissions': ['all.everything']},
                                          format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/roles/', {'name': 'cashier', 'permissions': []},
                                          format='json').status_code, 400)

    def test_owner_role_is_protected(self):
        self.as_owner()
        url = f'/api/roles/{self.owner_role.id}/'
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertEqual(self.client.patch(url, {'name': 'Boss'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'permissions': []}, format='json').status_code, 400)

    def test_cannot_delete_role_in_use(self):
        self.make_user(roles=[(self.cashier, self.dxb)])
        self.as_owner()
        self.assertEqual(self.client.delete(f'/api/roles/{self.cashier.id}/').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/roles/{self.manager.id}/').status_code, 204)

    def test_permission_list_grouped(self):
        self.as_owner()
        groups = self.client.get('/api/permissions/').data
        self.assertEqual(groups[0]['module'], 'Administration')
        orders = next(g for g in groups if g['module'] == 'Orders')
        self.assertIn({'code': 'orders.create', 'label': 'Create orders'}, orders['permissions'])


class UserApiTests(Base):
    def payload(self, **overrides):
        data = {
            'email': 'New@Shop.com', 'full_name': 'New Staff', 'phone': '050', 'password': PASSWORD,
            'roles': [
                {'role': str(self.manager.id), 'branch': str(self.dxb.id)},
                {'role': str(self.cashier.id), 'branch': str(self.shj.id)},
            ],
        }
        data.update(overrides)
        return data

    def test_create_user_with_branch_roles(self):
        self.as_owner()
        res = self.client.post('/api/users/', self.payload(), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['email'], 'new@shop.com')
        self.assertNotIn('password', res.data)
        got = {(r['branch_name'], r['role_name']) for r in res.data['roles']}
        self.assertEqual(got, {('Dubai Marina', 'Branch Manager'), ('Sharjah', 'Cashier')})
        user = User.objects.get(email='new@shop.com')
        self.assertEqual(set(user.branch_assignments.values_list('branch__code', flat=True)), {'DXB1', 'SHJ1'})

    def test_org_wide_role_creates_no_assignment(self):
        self.as_owner()
        res = self.client.post('/api/users/', self.payload(roles=[{'role': str(self.admin.id), 'branch': None}]),
                               format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(User.objects.get(email='new@shop.com').branch_assignments.count(), 0)

    def test_validation(self):
        self.as_owner()
        self.assertIn('roles', self.client.post('/api/users/', self.payload(roles=[]), format='json').data)
        self.assertIn('password', self.client.post('/api/users/', self.payload(password='123'), format='json').data)
        dup = [{'role': str(self.cashier.id), 'branch': str(self.dxb.id)}] * 2
        self.assertEqual(self.client.post('/api/users/', self.payload(roles=dup), format='json').status_code, 400)

    def test_update_replaces_roles_and_assignments(self):
        user = self.make_user(roles=[(self.cashier, self.dxb)])
        self.as_owner()
        res = self.client.patch(f'/api/users/{user.id}/', {
            'roles': [{'role': str(self.manager.id), 'branch': str(self.shj.id)}],
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(list(user.branch_assignments.values_list('branch__code', flat=True)), ['SHJ1'])
        user.refresh_from_db()
        self.assertTrue(user.check_password(PASSWORD))

    def test_only_owner_can_grant_owner_or_edit_owners(self):
        admin = self.make_user('admin@shop.com', roles=[(self.admin, None)])
        self.client.force_authenticate(admin)
        grant = self.payload(roles=[{'role': str(self.owner_role.id), 'branch': None}])
        self.assertEqual(self.client.post('/api/users/', grant, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/users/{self.owner.id}/', {'phone': '1'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/users/{self.owner.id}/').status_code, 403)

    def test_last_owner_is_protected(self):
        self.as_owner()
        url = f'/api/users/{self.owner.id}/'
        self.assertEqual(self.client.patch(url, {'is_active': False}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'roles': [{'role': str(self.admin.id), 'branch': None}]},
                                           format='json').status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 400)  # also: can't delete yourself

    def test_deactivated_user_cannot_login(self):
        user = self.make_user(roles=[(self.cashier, self.dxb)])
        self.as_owner()
        self.client.patch(f'/api/users/{user.id}/', {'is_active': False}, format='json')
        self.client.force_authenticate(None)
        res = self.client.post('/api/auth/login/', {'email': 'staff@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(res.status_code, 400)


class TokenClaimTests(Base):
    """Roles and permissions live in the access token, scoped to the active branch."""

    def setUp(self):
        super().setUp()
        self.staff = self.make_user(roles=[(self.cashier, self.dxb), (self.manager, self.shj)])

    def login(self, email='staff@shop.com', **extra):
        return self.client.post('/api/auth/login/', {'email': email, 'password': PASSWORD, **extra}, format='json')

    def claims(self):
        return dict(AccessToken(self.client.cookies['access_token'].value).payload)

    def csrf(self):
        return {'HTTP_X_CSRFTOKEN': self.client.cookies['csrftoken'].value}

    def test_login_claims(self):
        res = self.login()
        c = self.claims()
        self.assertEqual(c['sub'], str(self.staff.id))
        self.assertFalse(c['is_owner'])
        self.assertEqual(c['active_branch_id'], str(self.dxb.id))   # first branch by name
        self.assertEqual(c['roles'], ['Cashier'])
        self.assertEqual(c['permissions'], ['orders.create', 'orders.view'])
        me = res.data['user']
        self.assertEqual(me['active_branch_id'], str(self.dxb.id))
        self.assertEqual([b['code'] for b in me['branches']], ['DXB1', 'SHJ1'])

    def test_login_with_preferred_branch_and_switch(self):
        self.login(branch_id=str(self.shj.id))
        self.assertEqual(self.claims()['roles'], ['Branch Manager'])
        res = self.client.post('/api/auth/switch-branch/', {'branch_id': str(self.dxb.id)}, format='json', **self.csrf())
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.claims()['roles'], ['Cashier'])
        other = Branch.objects.create(name='Other', code='OTH')
        res = self.client.post('/api/auth/switch-branch/', {'branch_id': str(other.id)}, format='json', **self.csrf())
        self.assertEqual(res.status_code, 403)

    def test_owner_without_branches_still_has_org_permissions(self):
        Branch.objects.update(is_active=False)
        self.login('owner@shop.com')
        c = self.claims()
        self.assertTrue(c['is_owner'])
        self.assertIsNone(c['active_branch_id'])
        self.assertIn('branches.manage', c['permissions'])

    def test_refresh_recomputes_permissions(self):
        self.login()
        RolePermission.objects.create(role=self.cashier, permission=Permission.objects.get(code='reports.view'))
        self.assertNotIn('reports.view', self.claims()['permissions'])
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 200)
        self.assertIn('reports.view', self.claims()['permissions'])

    def test_branch_permission_class(self):
        class DeleteOrder(APIView):
            permission_classes = [IsAuthenticated, branch_permission('orders.delete')]

            def post(self, request):
                return Response('ok')

        view = DeleteOrder.as_view()

        def call(user, branch_id=None):
            _, access_token, _, _ = build_tokens(user, branch_id)
            req = APIRequestFactory().post('/x/')
            force_authenticate(req, user, token=access_token)
            return view(req).status_code

        self.assertEqual(call(self.staff, self.dxb.id), 403)   # cashier in Dubai
        self.assertEqual(call(self.staff, self.shj.id), 200)   # manager in Sharjah
        self.assertEqual(call(self.owner, self.dxb.id), 200)   # owner
        self.assertEqual(call(self.make_user('nobranch@shop.com')), 400)
