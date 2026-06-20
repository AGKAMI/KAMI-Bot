import json
import subprocess
import urllib.request

OWNER = "AGKAMI"
REPO = "KAMI-Bot"
WORKFLOW = "deploy-bot-hosting.yml"
REF = "main"


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
    raise RuntimeError("No GitHub token found")


def request(method: str, url: str, token: str, data: dict | None = None) -> tuple[int, str]:
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
            "User-Agent": "kermes-workflow-test",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def main() -> None:
    token = get_github_token()
    dispatch_url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/workflows/{WORKFLOW}/dispatches"
    status, body = request("POST", dispatch_url, token, {"ref": REF})
    print("dispatch", status, body[:300])

    runs_url = f"https://api.github.com/repos/{OWNER}/{REPO}/actions/runs?branch=main&per_page=3"
    status, body = request("GET", runs_url, token)
    print("runs", status)
    data = json.loads(body)
    for run in data.get("workflow_runs", [])[:3]:
        print(run["id"], run["name"], run["status"], run.get("conclusion"), run["html_url"])


if __name__ == "__main__":
    main()
