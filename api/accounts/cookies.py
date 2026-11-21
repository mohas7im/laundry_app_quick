from django.conf import settings


def _base_kwargs():
    cfg = settings.AUTH_COOKIE
    return {
        'secure': cfg['SECURE'],
        'httponly': True,
        'samesite': cfg['SAMESITE'],
        'domain': cfg['DOMAIN'],
    }


def set_auth_cookies(response, access, refresh=None):
    cfg = settings.AUTH_COOKIE
    jwt = settings.SIMPLE_JWT

    response.set_cookie(
        cfg['ACCESS_NAME'],
        str(access),
        max_age=int(jwt['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        path=cfg['ACCESS_PATH'],
        **_base_kwargs(),
    )
    if refresh is not None:
        response.set_cookie(
            cfg['REFRESH_NAME'],
            str(refresh),
            max_age=int(jwt['REFRESH_TOKEN_LIFETIME'].total_seconds()),
            path=cfg['REFRESH_PATH'],
            **_base_kwargs(),
        )
    return response


def clear_auth_cookies(response):
    cfg = settings.AUTH_COOKIE
    response.delete_cookie(cfg['ACCESS_NAME'], path=cfg['ACCESS_PATH'], domain=cfg['DOMAIN'], samesite=cfg['SAMESITE'])
    response.delete_cookie(cfg['REFRESH_NAME'], path=cfg['REFRESH_PATH'], domain=cfg['DOMAIN'], samesite=cfg['SAMESITE'])
    return response
