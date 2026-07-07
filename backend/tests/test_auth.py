import datetime
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app import config
from app.services import auth, supabase_client


# Fake PyJWKClient replacement: ignores the token's kid and always returns the
# public key the test controls, so the ES256 path is exercised with zero network.
class _FakeSigningKey:
    def __init__(self, key: object) -> None:
        self.key = key


class _FakeJWKSClient:
    def __init__(self, key: object) -> None:
        self._key = key

    def get_signing_key_from_jwt(self, token: str) -> _FakeSigningKey:
        return _FakeSigningKey(self._key)


def _payload(
    *,
    sub: str | None = "user-uuid-1",
    aud: str = auth.EXPECTED_AUDIENCE,
    exp_delta_seconds: int = 3600,
    include_metadata: bool = True,
) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc)
    claims: dict = {
        "aud": aud,
        "iat": now,
        "exp": now + datetime.timedelta(seconds=exp_delta_seconds),
    }
    if sub is not None:
        claims["sub"] = sub
    if include_metadata:
        claims["email"] = "octo@example.com"
        claims["user_metadata"] = {"provider_id": "12345", "user_name": "octocat"}
    return claims


# Verification against the project's asymmetric (ES256) signing keys — the primary
# path for the target Supabase project. A locally generated EC keypair stands in
# for the project's keys, injected via a fake JWKS client. Fully offline.
class Es256AuthTests(unittest.TestCase):
    def setUp(self) -> None:
        auth.reset_jwks_client()
        self._private_key = ec.generate_private_key(ec.SECP256R1())
        self._public_key = self._private_key.public_key()
        # ES256 path is selected only when no HS256 secret is set; a SUPABASE_URL
        # must be present so the "nothing to verify against" guard passes.
        self._cfg = [
            patch.object(config, "SUPABASE_JWT_SECRET", ""),
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
            patch.object(
                auth, "_get_jwks_client", return_value=_FakeJWKSClient(self._public_key)
            ),
        ]
        for p in self._cfg:
            p.start()

    def tearDown(self) -> None:
        for p in self._cfg:
            p.stop()
        auth.reset_jwks_client()

    def _sign(self, payload: dict, key: object | None = None) -> str:
        return jwt.encode(payload or {}, key or self._private_key, algorithm="ES256")

    def test_valid_token_returns_user(self) -> None:
        token = self._sign(_payload())
        user = auth.get_current_user(f"Bearer {token}")
        self.assertIsNotNone(user)
        assert user is not None  # for type-checkers
        self.assertEqual(user.user_id, "user-uuid-1")
        self.assertEqual(user.github_id, "12345")
        self.assertEqual(user.github_login, "octocat")
        self.assertEqual(user.email, "octo@example.com")

    def test_expired_token_rejected(self) -> None:
        token = self._sign(_payload(exp_delta_seconds=-10))
        self.assertIsNone(auth.get_current_user(f"Bearer {token}"))

    def test_wrong_key_rejected(self) -> None:
        # Signed by a DIFFERENT EC key than the one the JWKS client hands back.
        other_key = ec.generate_private_key(ec.SECP256R1())
        token = self._sign(_payload(), key=other_key)
        self.assertIsNone(auth.get_current_user(f"Bearer {token}"))

    def test_wrong_audience_rejected(self) -> None:
        token = self._sign(_payload(aud="not-authenticated"))
        self.assertIsNone(auth.get_current_user(f"Bearer {token}"))

    def test_alg_none_forgery_rejected(self) -> None:
        # A token that asks to be verified with `alg: none` must be rejected
        # because the accepted algorithm set is pinned to ES256/RS256.
        forged = jwt.encode(_payload(), key="", algorithm="none")
        self.assertIsNone(auth.get_current_user(f"Bearer {forged}"))

    def test_missing_sub_rejected(self) -> None:
        token = self._sign(_payload(sub=None))
        self.assertIsNone(auth.get_current_user(f"Bearer {token}"))

    def test_garbage_token_rejected(self) -> None:
        self.assertIsNone(auth.get_current_user("Bearer not.a.jwt"))

    def test_non_github_token_has_no_github_fields(self) -> None:
        token = self._sign(_payload(include_metadata=False))
        user = auth.get_current_user(f"Bearer {token}")
        assert user is not None
        self.assertEqual(user.user_id, "user-uuid-1")
        self.assertIsNone(user.github_id)
        self.assertIsNone(user.github_login)


# Legacy shared-secret (HS256) fallback — used only when SUPABASE_JWT_SECRET is
# set. Verifies the presence of the secret switches paths and still enforces
# signature/expiry.
class Hs256FallbackTests(unittest.TestCase):
    _SECRET = "test-shared-secret-at-least-32-bytes-long"

    def setUp(self) -> None:
        auth.reset_jwks_client()
        self._cfg = [
            patch.object(config, "SUPABASE_JWT_SECRET", self._SECRET),
            patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"),
        ]
        for p in self._cfg:
            p.start()

    def tearDown(self) -> None:
        for p in self._cfg:
            p.stop()

    def test_valid_hs256_token_returns_user(self) -> None:
        token = jwt.encode(_payload(), self._SECRET, algorithm="HS256")
        user = auth.get_current_user(f"Bearer {token}")
        assert user is not None
        self.assertEqual(user.user_id, "user-uuid-1")

    def test_wrong_secret_rejected(self) -> None:
        token = jwt.encode(
            _payload(), "a-different-secret-also-32-bytes-long-x", algorithm="HS256"
        )
        self.assertIsNone(auth.get_current_user(f"Bearer {token}"))

    def test_expired_hs256_rejected(self) -> None:
        token = jwt.encode(
            _payload(exp_delta_seconds=-10), self._SECRET, algorithm="HS256"
        )
        self.assertIsNone(auth.get_current_user(f"Bearer {token}"))


# Header parsing, the unconfigured guard, and the require_user dependency.
class HeaderAndDependencyTests(unittest.TestCase):
    def test_missing_and_malformed_headers_are_anonymous(self) -> None:
        for header in [None, "", "token-without-scheme", "Basic abc", "Bearer", "Bearer  "]:
            self.assertIsNone(auth.get_current_user(header))

    def test_unconfigured_backend_is_anonymous(self) -> None:
        # No JWT secret and no SUPABASE_URL: a token cannot be verified against
        # anything, so the caller is treated as anonymous (dev/self-host flow).
        with patch.object(config, "SUPABASE_JWT_SECRET", ""), patch.object(
            config, "SUPABASE_URL", ""
        ):
            self.assertIsNone(auth.get_current_user("Bearer anything"))

    def test_require_user_raises_401_when_anonymous(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            auth.require_user(authorization=None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_require_user_returns_user_when_valid(self) -> None:
        secret = "dependency-test-secret-at-least-32-bytes"
        with patch.object(config, "SUPABASE_JWT_SECRET", secret), patch.object(
            config, "SUPABASE_URL", "https://ref.supabase.co"
        ):
            token = jwt.encode(_payload(), secret, algorithm="HS256")
            user = auth.require_user(authorization=f"Bearer {token}")
            self.assertEqual(user.user_id, "user-uuid-1")


# The login gate that the live analyze/generate/verify routes will use: open when
# Supabase is unconfigured (dev), required when configured (production-like).
class LoginGateTests(unittest.TestCase):
    def setUp(self) -> None:
        supabase_client.reset_client()

    def tearDown(self) -> None:
        supabase_client.reset_client()

    def test_unconfigured_is_open(self) -> None:
        # No Supabase => no login required; a missing/garbage token is fine.
        with patch.object(config, "SUPABASE_URL", ""), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", ""
        ):
            self.assertIsNone(auth.require_user_when_configured(authorization=None))
            self.assertIsNone(
                auth.require_user_when_configured(authorization="Bearer junk")
            )

    def test_configured_requires_user(self) -> None:
        # Configured but no valid token => 401.
        with patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", "svc"
        ):
            with self.assertRaises(HTTPException) as ctx:
                auth.require_user_when_configured(authorization=None)
            self.assertEqual(ctx.exception.status_code, 401)

    def test_configured_allows_valid_user(self) -> None:
        secret = "gate-secret-at-least-32-bytes-long-xxx"
        with patch.object(config, "SUPABASE_URL", "https://ref.supabase.co"), patch.object(
            config, "SUPABASE_SERVICE_ROLE_KEY", "svc"
        ), patch.object(config, "SUPABASE_JWT_SECRET", secret):
            token = jwt.encode(_payload(), secret, algorithm="HS256")
            user = auth.require_user_when_configured(authorization=f"Bearer {token}")
            assert user is not None
            self.assertEqual(user.user_id, "user-uuid-1")


if __name__ == "__main__":
    unittest.main()
