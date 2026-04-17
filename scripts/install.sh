#!/bin/bash
# GPU-Eye Installation Script

set -e

echo "Installing GPU-Eye dependencies..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required"
    exit 1
fi

# Install Python dependencies
pip3 install --user paramiko pyyaml

# Make collector executable
chmod +x src/collector.py

echo ""
echo "Dependencies installed."
echo ""
echo "Next steps:"
echo "  1. Copy servers.example.yaml to servers.yaml"
echo "  2. Edit servers.yaml with your server credentials"
echo "  3. Test: python3 src/collector.py --dry-run"
echo "  4. Set up cron: crontab -e"
echo "     Add: 0 * * * * cd $(pwd) && python3 src/collector.py >> /var/log/gpu-eye.log 2>&1"
echo ""
