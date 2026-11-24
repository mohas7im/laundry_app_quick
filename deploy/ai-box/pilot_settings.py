# Pilot overlay (AI box): Hashim's settings + the public host behind the Cloudflare tunnel. Not part of his repo.
from config.settings import *  # noqa
ALLOWED_HOSTS = ['.trycloudflare.com', 'localhost', '127.0.0.1', 'hq-web', 'hq-api']
CSRF_TRUSTED_ORIGINS = ['https://*.trycloudflare.com', 'http://localhost:8240', 'http://127.0.0.1:8240']
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
