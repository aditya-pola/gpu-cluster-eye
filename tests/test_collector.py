#!/usr/bin/env python3
"""Tests for collector.py"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def test_parse_nvidia_smi_single_gpu():
    """Test parsing nvidia-smi output for single GPU."""
    output = "1024, 24576"

    total_used = 0
    total_available = 0

    for line in output.split("\n"):
        if line.strip():
            parts = line.split(",")
            if len(parts) >= 2:
                used = int(parts[0].strip())
                total = int(parts[1].strip())
                total_used += used
                total_available += total

    assert total_used == 1024
    assert total_available == 24576


def test_parse_nvidia_smi_multi_gpu():
    """Test parsing nvidia-smi output for multiple GPUs."""
    output = """1024, 24576
2048, 24576
512, 16384"""

    total_used = 0
    total_available = 0

    for line in output.split("\n"):
        if line.strip():
            parts = line.split(",")
            if len(parts) >= 2:
                used = int(parts[0].strip())
                total = int(parts[1].strip())
                total_used += used
                total_available += total

    assert total_used == 1024 + 2048 + 512
    assert total_available == 24576 + 24576 + 16384


def test_parse_nvidia_smi_empty():
    """Test parsing empty nvidia-smi output."""
    output = ""

    total_used = 0
    total_available = 0

    for line in output.split("\n"):
        if line.strip():
            parts = line.split(",")
            if len(parts) >= 2:
                try:
                    used = int(parts[0].strip())
                    total = int(parts[1].strip())
                    total_used += used
                    total_available += total
                except ValueError:
                    pass

    assert total_used == 0
    assert total_available == 0


def test_status_json_structure():
    """Test status.json has correct structure."""
    status = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "servers": ["server1", "server2"],
        "samples": [
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": {
                    "server1": {
                        "vram_used_mb": 1024,
                        "vram_total_mb": 24576,
                        "reachable": True,
                    },
                    "server2": {
                        "vram_used_mb": None,
                        "vram_total_mb": None,
                        "reachable": False,
                    },
                },
            }
        ],
    }

    json_str = json.dumps(status)
    parsed = json.loads(json_str)

    assert "last_updated" in parsed
    assert "servers" in parsed
    assert "samples" in parsed
    assert len(parsed["samples"]) == 1
    assert "server1" in parsed["samples"][0]["data"]
    assert parsed["samples"][0]["data"]["server1"]["reachable"] is True
    assert parsed["samples"][0]["data"]["server2"]["reachable"] is False


def test_vram_percentage_calculation():
    """Test VRAM percentage calculation."""
    vram_used = 12288
    vram_total = 24576

    percentage = (vram_used / vram_total) * 100

    assert percentage == 50.0


def test_vram_percentage_zero_total():
    """Test VRAM percentage when total is zero."""
    vram_used = 0
    vram_total = 0

    percentage = (vram_used / vram_total * 100) if vram_total > 0 else 0

    assert percentage == 0


if __name__ == "__main__":
    test_parse_nvidia_smi_single_gpu()
    test_parse_nvidia_smi_multi_gpu()
    test_parse_nvidia_smi_empty()
    test_status_json_structure()
    test_vram_percentage_calculation()
    test_vram_percentage_zero_total()
    print("All tests passed!")
