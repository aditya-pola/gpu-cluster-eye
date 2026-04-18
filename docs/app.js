const COLORS = {
  green: '#76ac29',
  yellow: '#e6a92b',
  orange: '#f08530',
  red: '#e95c32',
  gray: '#9ca3af'
};

let statusData = null;

async function init() {
  try {
    const response = await fetch('data/status.json');
    statusData = await response.json();
    renderAll();
  } catch (err) {
    document.getElementById('status-banner').innerHTML = `
      <span class="status-dot" style="background:${COLORS.gray}"></span>
      <span class="status-text">Unable to load status data</span>
    `;
  }
}

function renderAll() {
  updateBanner();
  updateLastUpdated();
  renderUptimeServers();
  renderUsageServers();
  setupTabs();
  setupTooltip();
}

function updateBanner() {
  const banner = document.getElementById('status-banner');
  const servers = statusData.servers || [];
  const latestSample = statusData.samples?.[statusData.samples.length - 1];

  if (!latestSample) {
    banner.className = 'status-banner';
    banner.querySelector('.status-text').textContent = 'No data available';
    return;
  }

  const reachableCount = servers.filter(s => latestSample.data[s]?.reachable).length;
  const ratio = reachableCount / servers.length;

  let status, text;
  if (ratio === 1) {
    status = 'operational';
    text = 'All Systems Operational';
  } else if (ratio >= 0.9) {
    status = 'degraded';
    text = 'Minor Issues';
  } else if (ratio >= 0.5) {
    status = 'partial';
    text = 'Partial Outage';
  } else {
    status = 'major';
    text = 'Major Outage';
  }

  banner.className = `status-banner ${status}`;
  banner.querySelector('.status-text').textContent = text;
}

function updateLastUpdated() {
  const el = document.getElementById('last-updated');
  if (statusData.last_updated) {
    const date = new Date(statusData.last_updated);
    el.textContent = `Last updated: ${date.toLocaleString()}`;
  }
}

function renderUptimeServers() {
  const container = document.getElementById('uptime-servers');
  const servers = statusData.servers || [];

  container.innerHTML = servers.map(server => {
    const days = aggregateToDays(server);
    const stat = calculateUptimeStat(server, days);

    return `
      <div class="server-row">
        <div class="server-name">
          <span>${server}</span>
          <span class="server-stat">${stat}</span>
        </div>
        <div class="status-bar" data-server="${server}" data-mode="uptime">
          ${days.map((day, i) => `
            <div class="status-segment"
                 style="background:${getUptimeColor(day)}"
                 data-index="${i}"
                 data-date="${day.date}"
                 data-down-hours="${day.downHours || 0}"
                 data-network-hours="${day.networkIssueHours || 0}">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderUsageServers() {
  const container = document.getElementById('usage-servers');
  const servers = statusData.servers || [];

  const header = `
    <div class="usage-indicator">
      <div class="indicator-row">
        <span class="indicator-label">VRAM <span class="indicator-hint">(top)</span></span>
        <div class="indicator-bar"></div>
      </div>
      <div class="indicator-row">
        <span class="indicator-label">Compute <span class="indicator-hint">(bottom)</span></span>
        <div class="indicator-bar"></div>
      </div>
      <div class="indicator-note">Showing peak usage per day, not real-time</div>
    </div>
  `;

  const rows = servers.map(server => {
    const days = aggregateToDays(server);

    return `
      <div class="server-row">
        <div class="server-name">
          <span>${server}</span>
        </div>
        <div class="status-bar" data-server="${server}" data-mode="vram">
          ${days.map((day, i) => `
            <div class="status-segment"
                 style="background:${getUsageColor(day.peakVram)}"
                 data-index="${i}"
                 data-date="${day.date}"
                 data-value="${day.peakVram || 0}"
                 data-vram-total="${day.vramTotal}">
            </div>
          `).join('')}
        </div>
        <div class="status-bar" data-server="${server}" data-mode="compute">
          ${days.map((day, i) => `
            <div class="status-segment"
                 style="background:${getUsageColor(day.peakCompute)}"
                 data-index="${i}"
                 data-date="${day.date}"
                 data-value="${day.peakCompute || 0}">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = header + rows;
}

function aggregateToDays(server) {
  const samples = statusData.samples || [];
  const servers = statusData.servers || [];
  const dayMap = new Map();

  samples.forEach(sample => {
    const date = sample.timestamp.split('T')[0];
    const serverData = sample.data[server];

    const allDown = servers.every(s => !sample.data[s]?.reachable);

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        date,
        reachableHours: 0,
        downHours: 0,
        networkIssueHours: 0,
        totalHours: 0,
        peakVram: 0,
        peakCompute: 0,
        vramTotal: 0
      });
    }

    const day = dayMap.get(date);
    day.totalHours++;

    if (allDown) {
      day.networkIssueHours++;
    } else if (serverData) {
      if (serverData.reachable) {
        day.reachableHours++;
        const vramPercent = serverData.vram_total_mb > 0
          ? (serverData.vram_used_mb / serverData.vram_total_mb) * 100
          : 0;
        day.peakVram = Math.max(day.peakVram, vramPercent);
        day.peakCompute = Math.max(day.peakCompute, serverData.compute_percent || 0);
        day.vramTotal = serverData.vram_total_mb;
      } else {
        day.downHours++;
      }
    }
  });

  const days = Array.from(dayMap.values()).map(day => ({
    ...day,
    hasData: day.totalHours > 0
  }));

  while (days.length < 90) {
    days.unshift({ date: null, hasData: false, downHours: 0, networkIssueHours: 0, peakVram: 0, peakCompute: 0, vramTotal: 0 });
  }

  return days.slice(-90);
}

function calculateUptimeStat(server, days) {
  const validDays = days.filter(d => d.hasData);
  if (validDays.length === 0) return 'No data';

  const totalDown = validDays.reduce((sum, d) => sum + (d.downHours || 0), 0);
  const totalNetwork = validDays.reduce((sum, d) => sum + (d.networkIssueHours || 0), 0);

  if (totalDown === 0 && totalNetwork === 0) return 'No downtime';

  const parts = [];
  if (totalDown > 0) parts.push(`${totalDown}h down`);
  if (totalNetwork > 0) parts.push(`${totalNetwork}h network`);
  return parts.join(', ');
}

function getUptimeColor(day) {
  if (!day.hasData) return COLORS.gray;

  const down = day.downHours || 0;
  const network = day.networkIssueHours || 0;

  if (down === 0 && network > 0 && day.reachableHours === 0) return COLORS.gray;
  if (down === 0) return COLORS.green;
  if (down <= 2) return COLORS.yellow;
  if (down <= 5) return COLORS.orange;
  return COLORS.red;
}

function getUsageColor(value) {
  if (value === null || value === undefined) return COLORS.gray;
  if (value <= 10) return COLORS.green;
  if (value <= 50) return COLORS.yellow;
  if (value <= 80) return COLORS.orange;
  return COLORS.red;
}

function getHourlyData(server, date, mode) {
  const samples = statusData.samples || [];
  const hourly = [];

  samples.forEach(sample => {
    const sampleDate = sample.timestamp.split('T')[0];
    if (sampleDate !== date) return;

    const hour = sample.timestamp.split('T')[1].substring(0, 5);
    const serverData = sample.data[server];

    if (!serverData) return;

    if (mode === 'uptime') {
      hourly.push({
        hour,
        status: serverData.reachable ? 'up' : 'down'
      });
    } else if (mode === 'vram') {
      if (serverData.reachable && serverData.vram_total_mb > 0) {
        const pct = (serverData.vram_used_mb / serverData.vram_total_mb) * 100;
        hourly.push({ hour, value: pct.toFixed(1) });
      } else {
        hourly.push({ hour, value: serverData.reachable ? '0' : 'down' });
      }
    } else if (mode === 'compute') {
      if (serverData.reachable) {
        hourly.push({ hour, value: (serverData.compute_percent || 0).toFixed(1) });
      } else {
        hourly.push({ hour, value: 'down' });
      }
    }
  });

  return hourly.sort((a, b) => a.hour.localeCompare(b.hour));
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-panel`).classList.add('active');

      document.getElementById('uptime-legend').style.display = tab.dataset.tab === 'uptime' ? 'flex' : 'none';
      document.getElementById('usage-legend').style.display = tab.dataset.tab === 'usage' ? 'flex' : 'none';
      document.getElementById('status-banner').style.display = tab.dataset.tab === 'uptime' ? 'flex' : 'none';
    });
  });
}

function setupTooltip() {
  const tooltip = document.getElementById('tooltip');

  document.addEventListener('mouseover', (e) => {
    const segment = e.target.closest('.status-segment');
    if (!segment) return;

    const bar = segment.closest('.status-bar');
    const server = bar.dataset.server;
    const mode = bar.dataset.mode;
    const date = segment.dataset.date;

    const hasDate = date && date !== 'null';
    let content = `<div class="tooltip-date">${hasDate ? date : 'No data'}</div>`;

    if (hasDate) {
      const hourly = getHourlyData(server, date, mode);

      if (mode === 'uptime') {
        const downHours = parseInt(segment.dataset.downHours, 10);
        const networkHours = parseInt(segment.dataset.networkHours, 10);
        const parts = [];
        if (downHours > 0) parts.push(`${downHours}h server down`);
        if (networkHours > 0) parts.push(`${networkHours}h network issue`);
        if (parts.length === 0) parts.push('No downtime');
        content += `<div class="tooltip-status">${parts.join(', ')}</div>`;
        if (hourly.length > 0) {
          content += `<div class="tooltip-hourly">`;
          hourly.forEach(h => {
            const icon = h.status === 'up' ? '●' : '○';
            content += `<span class="hourly-item">${h.hour} ${icon}</span>`;
          });
          content += `</div>`;
        }
      } else if (mode === 'vram') {
        const value = parseFloat(segment.dataset.value);
        const vramTotal = parseFloat(segment.dataset.vramTotal);
        if (isNaN(vramTotal) || vramTotal === 0) {
          content += `<div class="tooltip-status">No data</div>`;
        } else if (value === 0) {
          content += `<div class="tooltip-status">Idle</div>`;
        } else {
          content += `<div class="tooltip-status">Peak: ${value.toFixed(1)}% VRAM</div>`;
        }
        if (hourly.length > 0) {
          content += `<div class="tooltip-hourly">`;
          hourly.forEach(h => {
            content += `<span class="hourly-item">${h.hour} → ${h.value}%</span>`;
          });
          content += `</div>`;
        }
      } else if (mode === 'compute') {
        const value = parseFloat(segment.dataset.value);
        if (isNaN(value)) {
          content += `<div class="tooltip-status">No data</div>`;
        } else if (value === 0) {
          content += `<div class="tooltip-status">Idle</div>`;
        } else {
          content += `<div class="tooltip-status">Peak: ${value.toFixed(1)}% Compute</div>`;
        }
        if (hourly.length > 0) {
          content += `<div class="tooltip-hourly">`;
          hourly.forEach(h => {
            content += `<span class="hourly-item">${h.hour} → ${h.value}%</span>`;
          });
          content += `</div>`;
        }
      }
    }

    tooltip.innerHTML = content;
    tooltip.classList.add('visible');
  });

  document.addEventListener('mousemove', (e) => {
    tooltip.style.left = `${e.clientX + 10}px`;
    tooltip.style.top = `${e.clientY + 10}px`;
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('.status-segment')) {
      tooltip.classList.remove('visible');
    }
  });
}

init();
