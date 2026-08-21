"""Tests for explicit, spoof-resistant proxy-aware rate-limit identity."""

from __future__ import annotations

import pytest
from starlette.requests import Request

from controller import rate_limiter


def _request(peer: str | None, **headers: str) -> Request:
    """Build a real Starlette request with an optional immediate peer."""
    scope: dict[str, object] = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [
            (name.lower().encode("latin-1"), value.encode("latin-1"))
            for name, value in headers.items()
        ],
    }
    if peer is not None:
        scope["client"] = (peer, 12345)
    return Request(scope)


def _trust(monkeypatch: pytest.MonkeyPatch, *cidrs: str) -> None:
    networks = rate_limiter._parse_trusted_proxy_networks(tuple(cidrs))
    monkeypatch.setattr(rate_limiter, "_TRUSTED_PROXY_NETWORKS", networks)


def test_invalid_configured_proxy_cidr_fails_fast() -> None:
    """Reject a malformed configured trust boundary instead of starting open."""
    with pytest.raises(ValueError, match="Invalid TRUSTED_PROXY_CIDRS entry"):
        rate_limiter._parse_trusted_proxy_networks(("not-a-cidr",))


@pytest.mark.parametrize("address", ["127.0.0.1", "::1"])
def test_default_loopback_peers_are_trusted(address: str) -> None:
    """Trust only the loopback ingress peers supplied by the default boundary."""
    assert rate_limiter._is_trusted_proxy(address) is True


@pytest.mark.parametrize(
    "address",
    ["10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "8.8.8.8"],
)
def test_private_and_public_peers_are_not_implicitly_trusted(address: str) -> None:
    """Reject non-loopback peers until an operator explicitly configures them."""
    assert rate_limiter._is_trusted_proxy(address) is False


def test_malformed_peer_is_not_trusted() -> None:
    """Do not treat an invalid peer address as a trusted proxy."""
    assert rate_limiter._is_trusted_proxy("not-an-ip") is False


def test_configured_private_proxy_is_trusted(monkeypatch: pytest.MonkeyPatch) -> None:
    """Honor private ingress ranges only after they are explicitly configured."""
    _trust(monkeypatch, "127.0.0.1/32", "10.20.0.0/16")
    assert rate_limiter._is_trusted_proxy("10.20.4.8") is True
    assert rate_limiter._is_trusted_proxy("10.21.4.8") is False


def test_direct_uvicorn_uses_immediate_peer() -> None:
    """Ignore spoofable forwarding headers sent directly to Uvicorn."""
    request = _request("203.0.113.10", **{"X-Forwarded-For": "198.51.100.1"})
    assert rate_limiter._proxy_aware_remote_address(request) == "203.0.113.10"


def test_one_trusted_proxy_returns_forwarded_client() -> None:
    """Use the client address forwarded by an immediately trusted proxy."""
    request = _request("127.0.0.1", **{"x-forwarded-for": "203.0.113.42"})
    assert rate_limiter._proxy_aware_remote_address(request) == "203.0.113.42"


def test_multiple_trusted_proxies_are_removed_right_to_left(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Walk a configured forwarding chain from the immediate side outward."""
    _trust(monkeypatch, "127.0.0.1/32", "10.0.0.0/8")
    request = _request(
        "127.0.0.1",
        **{"x-forwarded-for": "203.0.113.42, 10.0.0.9"},
    )
    assert rate_limiter._proxy_aware_remote_address(request) == "203.0.113.42"


def test_nearest_untrusted_hop_defeats_spoofed_leftmost_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Stop at an untrusted intermediate hop, ignoring spoofed older values."""
    _trust(monkeypatch, "127.0.0.1/32", "10.0.0.0/8")
    request = _request(
        "127.0.0.1",
        **{"x-forwarded-for": "192.0.2.200, 198.51.100.25, 10.0.0.9"},
    )
    assert rate_limiter._proxy_aware_remote_address(request) == "198.51.100.25"


def test_all_forwarded_hops_trusted_falls_back_to_peer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Use the immediate peer when a trusted chain provides no client hop."""
    _trust(monkeypatch, "127.0.0.1/32", "10.0.0.0/8")
    request = _request(
        "127.0.0.1", **{"x-forwarded-for": "10.0.0.8, 10.0.0.9"}
    )
    assert rate_limiter._proxy_aware_remote_address(request) == "127.0.0.1"


@pytest.mark.parametrize(
    "header",
    ["not-an-ip", "203.0.113.42,", "203.0.113.42, invalid"],
)
def test_malformed_xff_rejects_the_header(header: str) -> None:
    """Fail closed to the immediate peer when any XFF token is malformed."""
    request = _request("127.0.0.1", **{"x-forwarded-for": header})
    assert rate_limiter._proxy_aware_remote_address(request) == "127.0.0.1"


def test_valid_x_real_ip_is_used_when_xff_is_absent() -> None:
    """Use a valid single X-Real-IP from a trusted proxy."""
    request = _request("127.0.0.1", **{"X-Real-IP": "203.0.113.50"})
    assert rate_limiter._proxy_aware_remote_address(request) == "203.0.113.50"


@pytest.mark.parametrize("header", ["client.example", "203.0.113.50, 10.0.0.1"])
def test_malformed_x_real_ip_rejects_the_header(header: str) -> None:
    """Reject invalid or multi-hop X-Real-IP values rather than trusting them."""
    request = _request("127.0.0.1", **{"x-real-ip": header})
    assert rate_limiter._proxy_aware_remote_address(request) == "127.0.0.1"


def test_ipv6_proxy_chain_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    """Normalize a valid IPv6 client while skipping configured IPv6 proxies."""
    _trust(monkeypatch, "::1/128", "fd00::/8")
    request = _request(
        "::1", **{"x-forwarded-for": "2001:0db8:0:0:0:0:0:1234, fd00::10"}
    )
    assert rate_limiter._proxy_aware_remote_address(request) == "2001:db8::1234"


def test_no_client_returns_empty_identity() -> None:
    """Return a stable empty key when the ASGI server provides no client."""
    assert rate_limiter._proxy_aware_remote_address(_request(None)) == ""
