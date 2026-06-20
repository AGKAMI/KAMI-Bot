import base64
import json
import os
import subprocess
import sys
import urllib.request

OWNER = "AGKAMI"
REPO = "KAMI-Bot"
SERVER_ID = "08b6894d"
PANEL_KEY_PATH = "C:/Users/ojuni/Downloads/ptlc_key.txt"


def get_github_token() -> str:
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        check=True,
    )
    for line in proc.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("No GitHub token found in git credential manager")


def api_request(method: str, url: str, token: str, data: dict | None = None) -> dict:
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": "token " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "kermes-deploy-setup",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    try:
        from nacl import encoding, public
    except ImportError as exc:
        raise RuntimeError("PyNaCl is required to encrypt GitHub secrets") from exc

    public_key = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def set_secret(name: str, value: str, token: str, key_id: str, public_key: str) -> None:
    encrypted_value = encrypt_secret(public_key, value)
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/{name}"
    api_request(
        "PUT",
        url,
        token,
        {"encrypted_value": encrypted_value, "key_id": key_id},
    )
    print(f"set {name}")


def main() -> None:
    token = get_github_token()
    panel_key = open(PANEL_KEY_PATH, encoding="utf-8").read().strip()

    key_url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/public-key"
    key = api_request("GET", key_url, token)

    set_secret("BOT_HOSTING_API_KEY", panel_key, token, key["key_id"], key["key"])
    set_secret("BOT_HOSTING_SERVER_ID", SERVER_ID, token, key["key_id"], key["key"])


if __name__ == "__main__":
    main()
