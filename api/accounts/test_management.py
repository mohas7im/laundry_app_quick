from django.core.cache import cache
from django.db import IntegrityError, transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from branches.models import Branch, UserBranchAssignment
from roles.models import Action, Menu, Permission, Role, RolePermission, UserRole
from roles.registry import SYSTEM_MENU_CODES
from roles.seed import ensure_owner_role, sync_menu_permissions
from .access import branch_permission, get_access
from .models import User
from .tokens import build_tokens
from .tests import body, error_fields

PASSWORD = 'Str0ng-pass-123'


CRUD = ['view', 'create', 'edit', 'delete']
ADMIN_CODES = [f'{m}.{a}' for m in ('branches', 'users', 'roles', 'permissions', 'menus') for a in CRUD]


def make_menu(code, parent=None, header=False):
    """A page (with a link) or a header (no link). Either way: one permission per action."""
    menu = Menu.objects.create(
        code=code, name=code.title(), parent=parent, is_header=header,
        router_name='' if header else code, router_link='' if header else f'/{code}',
    )
    sync_menu_permissions(Permission, Action, menu)
    return menu


def make_role(name, codes):
    role = Role.objects.create(name=name)
    RolePermission.objects.bulk_create(
        RolePermission(role=role, permission=p) for p in Permission.objects.filter(code__in=codes)
    )
    return role


class Base(APITestCase):
    def setUp(self):
        cache.clear()  # reset the login rate limit between tests
        # a menu a future Reports page would add; system menus (Orders, …) come from the migrations
        make_menu('reports')
        self.owner_role = ensure_owner_role(Role, RolePermission, Permission)
        self.owner = User.objects.create_user(email='owner@shop.com', password=PASSWORD, full_name='Owner')
        UserRole.objects.create(user=self.owner, role=self.owner_role)

        self.dxb = Branch.objects.create(name='Dubai Marina', code='DXB1')
        self.shj = Branch.objects.create(name='Sharjah', code='SHJ1')
        self.cashier = make_role('Cashier', ['orders.view', 'orders.create'])
        self.manager = make_role('Branch Manager', ['orders.view', 'orders.create', 'orders.delete'])
        self.admin = make_role('Admin', ADMIN_CODES)

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

    def test_system_menus_loaded(self):
        codes = set(Menu.objects.filter(code__in=SYSTEM_MENU_CODES).values_list('code', flat=True))
        self.assertEqual(codes, {'dashboard', 'orders', 'customers', 'catalogue', 'services', 'items', 'price_lists', 'prices',
                                 'upcharges', 'administration', 'branches', 'roles', 'permissions', 'users', 'menus'})
        self.assertEqual(list(Action.objects.values_list('code', flat=True)),
                         ['create', 'edit', 'delete', 'view', 'print'])
        self.assertEqual(Permission.objects.filter(menu__code='branches').count(), 5)
        self.assertEqual(Permission.objects.filter(menu__code='administration').count(), 5)  # headers too
        self.assertTrue(Permission.objects.filter(code='dashboard.view').exists())


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
        self.assertIn('users.edit', access.branch(self.shj.id).permissions)
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
        self.assertEqual(body(res)['code'], 'AUH-1')
        bid = body(res)['id']
        self.assertEqual(len(body(self.client.get('/api/branches/'))), 3)
        self.assertFalse(body(self.client.patch(f'/api/branches/{bid}/', {'is_active': False}, format='json'))['is_active'])
        self.assertEqual(self.client.delete(f'/api/branches/{bid}/').status_code, 200)

    def test_cannot_delete_branch_with_staff(self):
        self.make_user(roles=[(self.cashier, self.dxb)])
        self.as_owner()
        res = self.client.delete(f'/api/branches/{self.dxb.id}/')
        self.assertEqual(res.status_code, 409)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['referenced_tables'], ['user_branch_assignments', 'user_roles'])
        self.assertEqual(res.data['errors'][0]['error_code'], 'REFERENCED')

    def test_admin_role_can_manage_branch_staff_cannot(self):
        admin = self.make_user('admin@shop.com', roles=[(self.admin, None)])
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/branches/').status_code, 200)

        staff = self.make_user(roles=[(self.manager, self.dxb)])
        self.client.force_authenticate(staff)
        for url in ('/api/branches/', '/api/roles/', '/api/users/', '/api/permissions/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_branch_scoped_admin_permission_does_not_count(self):
        # admin permissions given only inside one branch must not unlock organization-level APIs
        user = self.make_user(roles=[(self.admin, self.dxb)])
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/users/').status_code, 403)


class RoleApiTests(Base):
    def test_create_role_then_set_permissions(self):
        self.as_owner()
        res = self.client.post('/api/roles/', {'name': 'Ironing', 'description': 'Press'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(body(res)['permission_count'], 0)
        url = f"/api/permissions/roles/{body(res)['id']}/"

        res = self.client.put(url, {'permissions': ['orders.view', 'orders.print', 'orders.view']}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(body(res)['permissions'], ['orders.print', 'orders.view'])
        self.assertEqual(body(self.client.get(url))['permissions'], ['orders.print', 'orders.view'])

        res = self.client.put(url, {'permissions': ['orders.view']}, format='json')  # replaces, not adds
        self.assertEqual(body(res)['permissions'], ['orders.view'])

    def test_unknown_permission_and_duplicate_name(self):
        self.as_owner()
        url = f'/api/permissions/roles/{self.cashier.id}/'
        self.assertEqual(self.client.put(url, {'permissions': ['all.everything']}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/roles/', {'name': 'cashier'}, format='json').status_code, 400)

    def test_permissions_menu_is_separate_from_roles(self):
        # roles.* alone doesn't open the Permissions menu
        roles_admin = make_role('Roles admin', [f'roles.{a}' for a in CRUD])
        self.client.force_authenticate(self.make_user('ra@shop.com', roles=[(roles_admin, None)]))
        self.assertEqual(self.client.get(f'/api/permissions/roles/{self.cashier.id}/').status_code, 403)
        self.assertEqual(self.client.get('/api/permissions/').status_code, 403)

        # permissions.view can read the grid and the role list, not save
        viewer = make_role('Permission viewer', ['permissions.view'])
        self.client.force_authenticate(self.make_user(roles=[(viewer, None)]))
        self.assertEqual(self.client.get('/api/permissions/').status_code, 200)
        self.assertEqual(self.client.get('/api/roles/').status_code, 200)
        url = f'/api/permissions/roles/{self.cashier.id}/'
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.put(url, {'permissions': []}, format='json').status_code, 403)

    def test_owner_role_is_protected(self):
        self.as_owner()
        url = f'/api/roles/{self.owner_role.id}/'
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertEqual(self.client.patch(url, {'name': 'Boss'}, format='json').status_code, 400)
        self.assertEqual(self.client.put(f'/api/permissions/roles/{self.owner_role.id}/', {'permissions': []},
                                         format='json').status_code, 400)
        # no other role can take the Owner name (the owner is found by name)
        self.assertEqual(self.client.post('/api/roles/', {'name': 'owner'}, format='json').status_code, 400)
        res = self.client.patch(f'/api/roles/{self.cashier.id}/', {'name': 'Owner'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_cannot_delete_role_in_use(self):
        self.make_user(roles=[(self.cashier, self.dxb)])
        self.as_owner()
        self.assertEqual(self.client.delete(f'/api/roles/{self.cashier.id}/').status_code, 409)
        self.assertEqual(self.client.delete(f'/api/roles/{self.manager.id}/').status_code, 200)

    def test_permission_matrix(self):
        self.as_owner()
        data = body(self.client.get('/api/permissions/'))
        self.assertEqual([a['code'] for a in data['actions']], ['create', 'edit', 'delete', 'view', 'print'])
        rows = {r['code']: r for r in data['menus']}
        self.assertTrue(rows['administration']['is_header'])
        self.assertEqual(rows['administration']['permissions']['view'], 'administration.view')
        self.assertEqual(rows['branches']['depth'], 1)
        self.assertEqual(rows['branches']['permissions']['print'], 'branches.print')
        codes = [r['code'] for r in data['menus']]
        self.assertLess(codes.index('administration'), codes.index('branches'))


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
        self.assertEqual(body(res)['email'], 'new@shop.com')
        self.assertNotIn('password', body(res))
        got = {(r['branch_name'], r['role_name']) for r in body(res)['roles']}
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
        self.assertIn('roles', error_fields(self.client.post('/api/users/', self.payload(roles=[]), format='json')))
        self.assertIn('password', error_fields(self.client.post('/api/users/', self.payload(password='123'), format='json')))
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
        me = body(res)
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
        self.assertIn('branches.create', c['permissions'])

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


class MenuPermissionTests(Base):
    """Admin APIs check the action that matches the HTTP method."""

    def test_view_only_can_read_not_write(self):
        viewer = make_role('Branch viewer', ['branches.view'])
        self.client.force_authenticate(self.make_user(roles=[(viewer, None)]))
        self.assertEqual(self.client.get('/api/branches/').status_code, 200)
        self.assertEqual(self.client.post('/api/branches/', {'name': 'X', 'code': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/branches/{self.dxb.id}/').status_code, 403)

    def test_users_page_can_read_branch_and_role_lists(self):
        hr = make_role('HR', ['users.view', 'users.create'])
        self.client.force_authenticate(self.make_user(roles=[(hr, None)]))
        self.assertEqual(self.client.get('/api/branches/').status_code, 200)
        self.assertEqual(self.client.get('/api/roles/').status_code, 200)
        self.assertEqual(self.client.post('/api/roles/', {'name': 'X'}, format='json').status_code, 403)


class MenuApiTests(Base):
    def page(self, **overrides):
        data = {'name': 'Suppliers', 'router_name': 'suppliers', 'router_link': '/suppliers',
                'router_description': 'Supplier list', 'icon': 'users', 'sort_order': 5}
        data.update(overrides)
        return data

    def test_create_page_gets_a_permission_per_action(self):
        self.as_owner()
        res = self.client.post('/api/menus/', self.page(), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(body(res)['code'], 'suppliers')  # from the name
        self.assertEqual(Permission.objects.filter(menu__code='suppliers').count(), 5)
        self.assertIn('suppliers.print', get_access(self.owner).org_permissions)  # owner gets new ones

    def test_tree_with_sub_header(self):
        self.as_owner()
        res = self.client.post('/api/menus/', {'name': 'Sales', 'is_sub_header': True}, format='json')
        self.assertEqual(res.status_code, 201, res.data)  # no link needed for a sub-header
        sales = Menu.objects.get(code='sales')
        self.assertEqual(Permission.objects.filter(menu=sales).count(), 5)
        res = self.client.post('/api/menus/', self.page(parent=str(sales.id)), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Menu.objects.get(code='suppliers').parent, sales)

    def test_validation(self):
        self.as_owner()
        post = lambda **kw: self.client.post('/api/menus/', self.page(**kw), format='json')  # noqa: E731
        self.assertIn('router_link', error_fields(post(router_link='')))          # a page needs a link
        self.assertIn('router_name', error_fields(post(router_name='')))          # and a router name
        self.assertIn('router_link', error_fields(post(router_link='orders')))    # must start with /
        self.assertIn('router_link', error_fields(post(router_link='/orders')))   # already used
        self.assertIn('name', error_fields(post(name='Orders!', router_link='/x')))  # code "orders" is taken
        self.assertIn('name', error_fields(post(name='123', router_link='/y')))      # no letters for a code
        both = self.client.post('/api/menus/', {'name': 'X', 'is_header': True, 'is_sub_header': True},
                                format='json')
        self.assertIn('is_sub_header', error_fields(both))

    def test_system_menus_keep_their_structure(self):
        self.as_owner()
        branches = Menu.objects.get(code='branches')
        url = f'/api/menus/{branches.id}/'
        self.assertEqual(self.client.patch(url, {'name': 'Shops', 'icon': 'home', 'sort_order': 9},
                                           format='json').status_code, 200)
        self.assertEqual(Permission.objects.get(code='branches.view').description, 'View Shops')
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.assertEqual(self.client.patch(url, {'router_link': '/shops'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'is_header': True}, format='json').status_code, 400)
        self.client.patch(url, {'code': 'shops'}, format='json')  # read-only: ignored
        self.assertEqual(Menu.objects.get(pk=branches.pk).code, 'branches')

    def test_no_loops_and_protected_parents(self):
        self.as_owner()
        top = make_menu('extras', header=True)
        inner = make_menu('innerpage', parent=top)
        self.assertEqual(self.client.patch(f'/api/menus/{top.id}/', {'parent': str(inner.id)},
                                           format='json').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/menus/{top.id}/').status_code, 409)  # has a child
        self.assertEqual(self.client.delete(f'/api/menus/{inner.id}/').status_code, 200)

    def test_my_menus_follow_token_permissions(self):
        self.make_user(roles=[(self.cashier, self.dxb)])
        self.client.post('/api/auth/login/', {'email': 'staff@shop.com', 'password': PASSWORD}, format='json')
        menus = body(self.client.get('/api/menus/my/'))
        self.assertEqual([m['code'] for m in menus], ['orders'])  # cashier: orders.view only

        self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': PASSWORD}, format='json')
        menus = {m['code']: m for m in body(self.client.get('/api/menus/my/'))}
        self.assertTrue(menus['administration']['is_header'])
        codes = list(menus)
        self.assertLess(codes.index('administration'), codes.index('menus'))

    def test_header_hidden_when_nothing_under_it_is_visible(self):
        only_header = make_role('Header only', ['administration.view'])
        self.make_user(roles=[(only_header, self.dxb)])
        self.client.post('/api/auth/login/', {'email': 'staff@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(body(self.client.get('/api/menus/my/')), [])


class ResponseFormatTests(Base):
    """Every response is a BaseResult: success, message, data, errors, referenced_tables."""

    KEYS = {'success', 'message', 'data', 'errors', 'referenced_tables'}

    def test_success_shape(self):
        self.as_owner()
        res = self.client.get('/api/branches/')
        self.assertEqual(set(res.data), self.KEYS)
        self.assertTrue(res.data['success'])
        self.assertEqual(res.data['message'], 'Branches retrieved successfully.')
        self.assertEqual(res.data['errors'], [])

    def test_validation_errors_have_codes_and_fields(self):
        self.as_owner()
        res = self.client.post('/api/branches/', {'name': 'Dubai Marina'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.data['success'])
        by_field = {e['field_name']: e for e in res.data['errors']}
        self.assertEqual(by_field['code']['error_code'], 'REQUIRED')
        self.assertEqual(by_field['name']['error_code'], 'VALIDATION_ERROR')  # duplicate name rule

    def test_nested_field_paths(self):
        self.as_owner()
        res = self.client.post('/api/users/', {
            'email': 'x@shop.com', 'full_name': 'X', 'password': PASSWORD,
            'roles': [{'role': 'not-a-uuid'}],
        }, format='json')
        self.assertIn('roles[0].role', error_fields(res))

    def test_not_authenticated_and_permission_denied(self):
        res = self.client.get('/api/branches/')
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data['errors'][0]['error_code'], 'NOT_AUTHENTICATED')

        self.client.force_authenticate(self.make_user(roles=[(self.cashier, self.dxb)]))
        res = self.client.get('/api/branches/')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['errors'][0]['error_code'], 'PERMISSION_DENIED')

    def test_business_rule_refusal(self):
        self.as_owner()
        res = self.client.delete(f'/api/roles/{self.owner_role.id}/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['errors'][0]['error_code'], 'OPERATION_NOT_ALLOWED')
        res = self.client.delete(f'/api/users/{self.owner.id}/')  # yourself
        self.assertEqual(res.data['errors'][0]['error_code'], 'OPERATION_NOT_ALLOWED')

    def test_delete_success_has_no_data(self):
        self.as_owner()
        res = self.client.delete(f'/api/roles/{self.manager.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data['data'], res.data['message']), (None, 'Role deleted successfully.'))
