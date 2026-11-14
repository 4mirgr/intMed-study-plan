"""Check live PWA CORS without credentials, Auth calls, account writes or forms."""
import base64
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ORIGINS = (
    "https://drgerami-md.ir", "https://www.drgerami-md.ir",
    "https://4mirgr.github.io", "https://gerami-website.pages.dev",
)
ENDPOINTS = (
    "https://api.drgerami-md.ir/functions/v1/intmed-login",
    "https://upwbktvnybsjugdegjji.supabase.co/functions/v1/intmed-login",
)
USER_AGENT = "Gerami-Website-Health/1.0"


def read(request):
    try:
        return urlopen(request, timeout=20)
    except HTTPError as response:
        return response


def main():
    config_request = Request("https://drgerami-md.ir/intmed/config.js", headers={"User-Agent": USER_AGENT})
    with urlopen(config_request, timeout=20) as response:
        text = response.read(32_768).decode("utf-8")
    match = re.search(r"window\.INTMED_CONFIG\s*=\s*(\{.*\});", text, re.S)
    if not match:
        raise RuntimeError("Public runtime configuration unavailable")
    key = json.loads(match.group(1))["supabaseAnonKey"]
    if not key.startswith("sb_publishable_"):
        claims = json.loads(base64.urlsafe_b64decode(key.split(".")[1] + "==="))
        if claims.get("role") != "anon":
            raise RuntimeError("Refusing a non-public key")
    for origin in ORIGINS:
        for endpoint in ENDPOINTS:
            with read(Request(endpoint, method="OPTIONS", headers={
                "Origin": origin, "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "apikey,content-type",
                "User-Agent": USER_AGENT,
            })) as response:
                assert response.status == 204, "Login preflight rejected"
                assert response.headers.get("Access-Control-Allow-Origin") == origin, "PWA origin not accepted"
                assert "POST" in response.headers.get("Access-Control-Allow-Methods", ""), "POST not allowed"
                allowed = response.headers.get("Access-Control-Allow-Headers", "").lower()
                assert "apikey" in allowed and "content-type" in allowed, "Required headers not allowed"
            # Empty JSON is rejected before rate limits, username lookup or Auth.
            with read(Request(endpoint, method="POST", data=b"{}", headers={
                "Origin": origin, "Content-Type": "application/json", "apikey": key,
                "User-Agent": USER_AGENT,
            })) as response:
                assert response.status == 401, "Empty request must reach credential validation only"
                assert response.headers.get("Access-Control-Allow-Origin") == origin, "Login error unreadable by PWA"
                assert response.headers.get("Cache-Control") == "no-store", "Login response must not be cached"
            print("PASS live PWA CORS:", origin, endpoint.split("/")[2])


if __name__ == "__main__":
    main()
