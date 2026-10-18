"""Shared HTTP rate limiter instance for slowapi decorators.

ENH [RL-HTTP]: Previously the limiter was created in main.py and registered
on app.state, but NO routes had @limiter.limit decorators — the limiter
existed but never enforced. This module provides a shared instance that
controllers can import and apply via decorators.

ENH [RL-HTTP-FIX]: slowapi uses the SYNCHRONOUS redis library (not
redis.asyncio). Upstash Redis requires TLS and has connection quirks
that the sync client doesn't handle well — it raises
`ConnectionError: Connection closed by server`. In dev mode (DEBUG=True),
we force memory storage to avoid this. In production, set
RATELIMIT_STORAGE_URL to a Redis URL that the sync client can handle
(standard Redis, not Upstash TLS-only), or use a separate Redis instance.

FIX [AUDIT-2-D]: the previous ``key_func=get_remote_address`` is not
proxy-aware — behind nginx / ALB / Cloudflare it returns the proxy's IP
for every request, so all users share a single rate-limit bucket. The
new ``_proxy_aware_remote_address`` honors ``X-Forwarded-For`` (nearest
untrusted hop) and ``X-Real-IP`` only when the immediate peer belongs to
an explicitly configured trusted-proxy CIDR.

Usage in controllers::

    from controller.rate_limiter import limiter

    @router.post("/endpoint")
    @limiter.limit("50 per minute")
    async def my_endpoint(request: Request, ...):
        ...

Note: slowapi requires the ``request: Request`` parameter to be present in
the route function signature for the decorator to work.
"""

import ipaddress

from slowapi import Limiter
from starlette.requests import Request

from config import get_config

Config = get_config()

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


def _parse_trusted_proxy_networks(cidrs: tuple[str, ...]) -> tuple[Network, ...]:
    """Parse configured proxy CIDRs, failing startup on an invalid boundary."""
    networks: list[Network] = []
    for cidr in cidrs:
        try:
            networks.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError as exc:
            raise ValueError(f"Invalid TRUSTED_PROXY_CIDRS entry: {cidr}") from exc
    return tuple(networks)


_TRUSTED_PROXY_NETWORKS = _parse_trusted_proxy_networks(Config.TRUSTED_PROXY_CIDRS)


def _is_trusted_proxy(ip_str: str) -> bool:
    """Return whether an IP belongs to an explicitly configured proxy network."""
    try:
        address = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(address in network for network in _TRUSTED_PROXY_NETWORKS)


def _parse_forwarded_chain(value: str) -> list[str] | None:
    """Return normalized IP tokens or None when any token is malformed."""
    tokens = [token.strip() for token in value.split(",")]
    if not tokens or any(not token for token in tokens):
        return None
    try:
        return [str(ipaddress.ip_address(token)) for token in tokens]
    except ValueError:
        return None


def _proxy_aware_remote_address(request: Request) -> str:
    """Resolve the nearest untrusted client hop for rate-limit identity."""
    peer = request.client.host if request.client else ""
    if not peer or not _is_trusted_proxy(peer):
        return peer

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        chain = _parse_forwarded_chain(forwarded_for)
        if chain is None:
            return peer
        for hop in reversed(chain):
            if not _is_trusted_proxy(hop):
                return hop
        return peer

    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        parsed = _parse_forwarded_chain(x_real_ip)
        if parsed is None or len(parsed) != 1:
            return peer
        return parsed[0]

    return peer


storage_uri = Config.RATELIMIT_STORAGE_URL
limiter = Limiter(
    key_func=_proxy_aware_remote_address,
    storage_uri=storage_uri,
    enabled=Config.RATELIMIT_ENABLED,
)
