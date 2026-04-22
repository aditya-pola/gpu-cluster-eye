# gpu-cluster-eye

Lightweight GPU cluster monitoring dashboard. Track uptime and usage (VRAM + Compute) across multiple servers over 90 days. Static site hosted on GitHub Pages — no dedicated server required.

| Uptime | Usage |
|--------|-------|
| ![Uptime](docs/screenshot-uptime.png) | ![Usage](docs/screenshot-usage.png) |

## Features

- **Uptime tracking** — Hours down per day, with network issue detection
- **VRAM & Compute usage** — Peak usage per day across all GPUs
- **90-day history** — Rolling window, automatic pruning
- **Static hosting** — GitHub Pages, no backend server needed
- **SSH-based collection** — Works with any Linux server running nvidia-smi

## Setup

### 1. Fork and create your own repo

1. Click **Fork** (or **Use this template**) on the GitHub repo page
2. Create a **private** repo under your own account — pick any name you like (e.g. `my-gpu-dashboard`)
   - Private keeps your SSH credentials safe even if you accidentally commit them
   - The repo name becomes your GitHub Pages URL: `https://USERNAME.github.io/REPO_NAME/`

> **Credential safety:** `servers.yaml` is already in `.gitignore`, so your SSH credentials won't be committed. A private repo is an extra layer of protection.

### 2. Clone and configure

```bash
# Clone your new private repo
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

# Install dependencies
pip install paramiko pyyaml

# Configure servers
cp servers.example.yaml servers.yaml
# Edit servers.yaml with your SSH credentials

# Test
python3 src/collector.py --dry-run

# Run and push
python3 src/collector.py
```

### 3. Customize (optional)

To change the dashboard title, edit `docs/index.html` and update the `<title>` and `<h1>` tags.

## Setup Cron (Hourly Collection)

Run the cron on **one machine** that can:
- SSH to all GPU servers
- Push to the git repo

This is typically one of your GPU servers or a management node.

```bash
# On your chosen collector machine:
crontab -e

# Add:
0 * * * * cd /path/to/your-repo && python3 src/collector.py >> /var/log/gpu-eye.log 2>&1
```

If the collector machine goes down, the dashboard shows gray "no data" bars for those hours.

## Enable GitHub Pages

1. Push to GitHub
2. Settings → Pages → Source: `main` branch, `/docs` folder
3. Access at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## Configuration

`servers.yaml`:
```yaml
servers:
  - name: gpu-node-01        # Display name
    host: 192.168.1.10       # IP or hostname
    user: admin              # SSH user
    password: secret         # Or use key_file instead
    # key_file: ~/.ssh/id_rsa
```

## How It Works

```
Collector (cron hourly)
    │
    ├── SSH to each server
    ├── Run nvidia-smi
    ├── Parse VRAM + Compute
    ├── Update docs/data/status.json
    └── git commit + push
           │
           ▼
    GitHub Pages (static)
           │
           ▼
    Browser
```

## Color Legend

**Uptime** (hours down per day):
- Green: 0h
- Yellow: 1-2h  
- Orange: 3-5h
- Red: 6h+

**Usage** (peak % per day):
- Green: 0-10%
- Yellow: 10-50%
- Orange: 50-80%
- Red: 80%+

## License

MIT License — see [LICENSE](LICENSE)

**Attribution required**: When using or redistributing this software, please credit the original author (Aditya Pola).
