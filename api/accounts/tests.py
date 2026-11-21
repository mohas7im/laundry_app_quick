from datetime import timedelta
from io import StringIO

from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import User


def body(res):
    """The `data` of a BaseResult response."""
    return res.data['data']


def error_fields(res):
    """Field names that have errors in a BaseResult response."""
    return {e['field_name'] for e in res.data['errors']}

ACCESS = settings.AUTH_COOKIE['ACCESS_NAME']
REFRESH = settings.AUTH_COOKIE['REFRESH_NAME']


class AuthFlowTests(APITestCase):
    def setUp(self):
        cache.clear()  # reset the login rate limit between tests
        self.client = APIClient(enforce_csrf_checks=True)
        self.user = User.objects.create_user(email='staff@shop.com', password='S3cure-pass!', full_name='Ajmal')

    def login(self, password='S3cure-pass!'):
        return self.client.post('/api/auth/login/', {'email': 'STAFF@shop.com', 'password': password}, format='json')

    def csrf_headers(self):
        return {'HTTP_X_CSRFTOKEN': self.client.cookies['csrftoken'].value}

    def test_login_sets_httponly_cookies_with_lifetimes(self):
        res = self.login()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(body(res)['email'], 'staff@shop.com')
        self.assertNotIn('access', body(res))  # tokens never in the body

        access, refresh = res.cookies[ACCESS], res.cookies[REFRESH]
        self.assertTrue(access['httponly'])
        self.assertTrue(refresh['httponly'])
        self.assertEqual(int(access['max-age']), 15 * 60)
        self.assertEqual(int(refresh['max-age']), 7 * 24 * 60 * 60)
        self.assertEqual(refresh['path'], '/api/auth/')
        self.assertIn('csrftoken', res.cookies)

    def test_wrong_password(self):
        res = self.login(password='nope')
        self.assertEqual(res.status_code, 400)
        self.assertNotIn(ACCESS, res.cookies)

    def test_me_requires_auth(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)
        self.login()
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(body(res)['full_name'], 'Ajmal')

    def test_unsafe_request_needs_csrf_header(self):
        self.login()
        body = {'current_password': 'S3cure-pass!', 'new_password': 'An0ther-pass!'}
        self.assertEqual(self.client.post('/api/auth/change-password/', body, format='json').status_code, 403)
        res = self.client.post('/api/auth/change-password/', body, format='json', **self.csrf_headers())
        self.assertEqual(res.status_code, 200)

    def test_refresh_rotates_and_old_token_is_blacklisted(self):
        self.login()
        old_refresh = self.client.cookies[REFRESH].value

        res = self.client.post('/api/auth/refresh/')
        self.assertEqual(res.status_code, 200)
        self.assertNotEqual(res.cookies[REFRESH].value, old_refresh)

        reuse = APIClient()
        reuse.cookies[REFRESH] = old_refresh
        self.assertEqual(reuse.post('/api/auth/refresh/').status_code, 401)

    def test_refresh_without_cookie(self):
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 401)

    def test_logout_clears_cookies_and_blacklists_refresh(self):
        self.login()
        refresh = self.client.cookies[REFRESH].value
        res = self.client.post('/api/auth/logout/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.cookies[ACCESS].value, '')
        self.assertEqual(res.cookies[REFRESH].value, '')

        reuse = APIClient()
        reuse.cookies[REFRESH] = refresh
        self.assertEqual(reuse.post('/api/auth/refresh/').status_code, 401)

    def test_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.login().status_code, 400)

    def test_expired_access_token_rejected(self):
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=-timedelta(seconds=1))
        self.client.cookies[ACCESS] = str(token)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)

    def test_create_owner_command(self):
        from django.core.management import call_command
        call_command('create_owner', email='Boss@Shop.com', name='Boss', password='Owner-pass-123', stdout=StringIO())
        owner = User.objects.get(email='boss@shop.com')
        self.assertTrue(owner.user_roles.filter(role__name='Owner', branch__isnull=True).exists())
        self.assertTrue(owner.check_password('Owner-pass-123'))
        self.assertFalse(hasattr(owner, 'is_superuser'))

    def test_admin_url_removed(self):
        self.assertEqual(self.client.get('/admin/').status_code, 404)

    def test_access_token_lifetime_is_15_minutes(self):
        token = AccessToken.for_user(self.user)
        self.assertEqual(token['exp'] - token['iat'], 15 * 60)
