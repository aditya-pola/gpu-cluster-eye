#!/usr/bin/env python3
"""
GPU-Eye Collector

Connects to servers via SSH, collects GPU VRAM usage via nvidia-smi,
updates status.json, and pushes to git.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import paramiko
import yaml

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
STATUS_FILE = PROJECT_ROOT / "docs" / "data" / "status.json"
SERVERS_FILE = PROJECT_ROOT / "servers.yaml"
RETENTION_DAYS = 90


def load_servers():
    if not SERVERS_FILE.exists():
        print(f"Error: {SERVERS_FILE} not found. Copy servers.example.yaml and configure.")
        sys.exit(1)

    with open(SERVERS_FILE) as f:
        config = yaml.safe_load(f)

    return config.get("servers", [])


def load_status():
    if STATUS_FILE.exists():
        with open(STATUS_FILE) as f:
            return json.load(f)
    return {"last_updated": None, "servers": [], "samples": []}


def save_status(status):
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


def collect_gpu_info(server):
    """SSH to server and run nvidia-smi to get VRAM usage."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        connect_kwargs = {
            "hostname": server["host"],
            "username": server["user"],
            "timeout": 30,
            "auth_timeout": 30,
        }

        if "password" in server:
            connect_kwargs["password"] = server["password"]
        else:
            key_file = os.path.expanduser(server.get("key_file", "~/.ssh/id_rsa"))
            connect_kwargs["key_filename"] = key_file

        client.connect(**connect_kwargs)

        cmd = "nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits"
        stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()

        if error and "nvidia-smi" in error.lower():
            return {"vram_used_mb": None, "vram_total_mb": None, "compute_percent": None, "reachable": False}

        total_used = 0
        total_available = 0
        gpu_count = 0
        total_compute = 0

        for line in output.split("\n"):
            if line.strip():
                parts = line.split(",")
                if len(parts) >= 3:
                    try:
                        used = int(parts[0].strip())
                        total = int(parts[1].strip())
                        compute = int(parts[2].strip())
                        total_used += used
                        total_available += total
                        total_compute += compute
                        gpu_count += 1
                    except ValueError:
                        continue

        avg_compute = total_compute / gpu_count if gpu_count > 0 else 0

        return {
            "vram_used_mb": total_used,
            "vram_total_mb": total_available,
            "compute_percent": round(avg_compute, 1),
            "reachable": True,
        }

    except Exception as e:
        print(f"  Error connecting to {server['name']}: {e}")
        return {"vram_used_mb": None, "vram_total_mb": None, "compute_percent": None, "reachable": False}

    finally:
        client.close()


def prune_old_samples(status):
    """Remove samples older than RETENTION_DAYS."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    cutoff_str = cutoff.isoformat()

    status["samples"] = [
        s for s in status["samples"]
        if s["timestamp"] >= cutoff_str
    ]


def git_push():
    """Commit and push status.json changes."""
    try:
        os.chdir(PROJECT_ROOT)

        subprocess.run(
            ["git", "add", "public/data/status.json"],
            check=True,
            capture_output=True,
        )

        timestamp = datetime.now().strftime("%Y-%m-%dT%H:00")
        result = subprocess.run(
            ["git", "commit", "-m", f"data: {timestamp}"],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            if "nothing to commit" in result.stdout.lower() or "nothing to commit" in result.stderr.lower():
                print("  No changes to commit")
                return True
            print(f"  Commit failed: {result.stderr}")
            return False

        result = subprocess.run(
            ["git", "push"],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            print(f"  Push failed: {result.stderr}")
            return False

        print("  Pushed to git")
        return True

    except Exception as e:
        print(f"  Git error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Collect GPU status from servers")
    parser.add_argument("--dry-run", action="store_true", help="Collect but don't commit/push")
    parser.add_argument("--no-push", action="store_true", help="Commit but don't push")
    args = parser.parse_args()

    print(f"GPU-Eye Collector - {datetime.now().isoformat()}")

    servers = load_servers()
    if not servers:
        print("No servers configured")
        sys.exit(1)

    print(f"Collecting from {len(servers)} servers...")

    status = load_status()
    timestamp = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0).isoformat()

    sample = {"timestamp": timestamp, "data": {}}

    for server in servers:
        name = server["name"]
        print(f"  {name}...", end=" ", flush=True)
        info = collect_gpu_info(server)
        sample["data"][name] = info

        if info["reachable"]:
            vram_pct = (info["vram_used_mb"] / info["vram_total_mb"] * 100) if info["vram_total_mb"] > 0 else 0
            print(f"OK (VRAM: {vram_pct:.1f}%, Compute: {info['compute_percent']}%)")
        else:
            print("UNREACHABLE")

    status["samples"].append(sample)
    status["last_updated"] = timestamp
    status["servers"] = list(set(status["servers"]) | {s["name"] for s in servers})

    prune_old_samples(status)

    if args.dry_run:
        print("\nDry run - not saving or pushing")
        print(json.dumps(sample, indent=2))
        return

    save_status(status)
    print(f"\nSaved to {STATUS_FILE}")

    if not args.no_push:
        git_push()


if __name__ == "__main__":
    main()
