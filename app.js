// ── State ──────────────────────────────────────────────────────────
let tournaments = []; // { score: number, days: number, id: number }
let nextId = 0;
let loadedFromHash = false;

// ── Persistence ────────────────────────────────────────────────────
function saveState() {
  localStorage.setItem('mukrs_tournaments', JSON.stringify(tournaments));
}

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem('mukrs_tournaments'));
    if (Array.isArray(data)) {
      tournaments = data;
      nextId = tournaments.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
    }
  } catch (e) { /* ignore */ }
}

// ── MUKRS Calculation ──────────────────────────────────────────────
function getExpandedResults(tourList) {
  const results = [];
  for (const t of tourList) {
    const label = t.name || `T${t.id}`;
    for (let i = 0; i < t.days; i++) {
      results.push({ score: t.score, source: label, isPlaceholder: false });
    }
  }
  // Pad to minimum 10
  while (results.length < 10) {
    results.push({ score: 0, source: 'placeholder', isPlaceholder: true });
  }
  return results;
}

function calculateMUKRS(tourList) {
  const expanded = getExpandedResults(tourList);
  const sorted = [...expanded].sort((a, b) => b.score - a.score);
  const n = sorted.length;

  // Part A: drop bottom floor(20%), keep ceil(80%)
  const dropA = Math.floor(n * 0.2);
  const keepA = n - dropA;
  const partAResults = sorted.slice(0, keepA);
  const partASum = partAResults.reduce((s, r) => s + r.score, 0);
  const partA = partASum / keepA;

  // Part B: top 8
  const keepB = Math.min(8, n);
  const partBResults = sorted.slice(0, keepB);
  const partBSum = partBResults.reduce((s, r) => s + r.score, 0);
  const partB = partBSum / keepB;

  // Build index sets
  const partASet = new Set(partAResults.map((_, i) => i));
  const partBSet = new Set(partBResults.map((_, i) => i));
  const droppedASet = new Set();
  for (let i = keepA; i < n; i++) droppedASet.add(i);

  return {
    partA,
    partB,
    mukrs: (partA + partB) / 2,
    sorted,
    keepA,
    keepB,
    partASet,
    partBSet,
    droppedASet,
    totalResults: n
  };
}

function calculateMUKRSWithExtra(tourList, extraScore, extraDays) {
  const combined = [
    ...tourList,
    { score: extraScore, days: extraDays, id: 9999 }
  ];
  return calculateMUKRS(combined);
}

// ── Base rank / Position conversion ────────────────────────────────
// Base Rank = (Players - Position) / (Players - 1) * 1000
// Position = Players - Score * (Players - 1) / 1000

function scoreToPosition(score, players) {
  if (players < 2) return null;
  const pos = players - score * (players - 1) / 1000;
  return Math.max(1, Math.floor(pos)); // floor because lower position = better
}

function positionToScore(position, players) {
  if (players < 2) return 0;
  return (players - position) / (players - 1) * 1000;
}

function formatPosition(pos, players) {
  const suffix = (pos) => {
    if (pos % 100 >= 11 && pos % 100 <= 13) return 'th';
    switch (pos % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  return `${pos}${suffix(pos)}`;
}

// ── Binary search for required score ───────────────────────────────
function findRequiredScore(tourList, target, days) {
  // Check max possible
  const maxCalc = calculateMUKRSWithExtra(tourList, 1000, days);
  if (maxCalc.mukrs < target) return { status: 'impossible', score: null, maxMUKRS: maxCalc.mukrs };

  // Check if already achieved
  const minCalc = calculateMUKRSWithExtra(tourList, 0, days);
  if (minCalc.mukrs >= target) return { status: 'already', score: 0, newMUKRS: minCalc.mukrs };

  // Binary search
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const calc = calculateMUKRSWithExtra(tourList, mid, days);
    if (calc.mukrs < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return { status: 'needed', score: hi };
}

// ── UI Rendering ───────────────────────────────────────────────────
function render() {
  renderResultsList();
  renderMUKRS();
  recalcTarget();
  recalcCompare();
  saveState();
  updateHash();
}

function renderResultsList() {
  const container = document.getElementById('results-list');
  const actionsRow = document.getElementById('actions-row');

  if (tournaments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="big-icon">&#9830;</div>
        Add your tournament results above
      </div>`;
    actionsRow.style.display = 'none';
    return;
  }

  actionsRow.style.display = 'flex';

  let html = `<div class="table-wrap"><table class="results-table">
    <thead><tr><th>Score</th><th>Days</th><th>Expanded</th><th></th></tr></thead><tbody>`;

  let totalDays = 0;
  for (const t of tournaments) {
    totalDays += t.days;
    const nameDisplay = t.name ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.1rem;">${t.name}</div>` : '';
    html += `<tr>
      <td class="score-cell">${t.score}${nameDisplay}</td>
      <td>${t.days} day${t.days > 1 ? 's' : ''}</td>
      <td style="color:var(--text-muted);">${Array(t.days).fill(t.score).join(', ')}</td>
      <td><button class="btn btn-danger" onclick="removeResult(${t.id})">&#10005;</button></td>
    </tr>`;
  }

  html += `</tbody></table></div>`;
  html += `<div style="margin-top:0.5rem; font-size:0.8rem; color:var(--text-muted);">
    Total: ${tournaments.length} tournaments, ${totalDays} result-days${totalDays < 10 ? ` (+ ${10 - totalDays} placeholder 0s)` : ''}
  </div>`;

  if (totalDays > 0 && totalDays < 16) {
    html += `<div class="eligibility-warning">
      <strong>Eligibility:</strong> You have ${totalDays} day${totalDays > 1 ? 's' : ''} of tournament play. Selection requires a minimum of <strong>16 days</strong> of MERS tournament play (at least 4 in the UK and 4 outside the UK). You need at least <strong>${16 - totalDays} more day${16 - totalDays > 1 ? 's' : ''}</strong> to be eligible.
    </div>`;
  }

  container.innerHTML = html;
}

function renderMUKRS() {
  const mukrsEl = document.getElementById('mukrs-value');
  const partAEl = document.getElementById('part-a-value');
  const partBEl = document.getElementById('part-b-value');
  const partADetail = document.getElementById('part-a-detail');
  const partBDetail = document.getElementById('part-b-detail');
  const breakdownSection = document.getElementById('breakdown-section');

  if (tournaments.length === 0) {
    mukrsEl.innerHTML = '&mdash;';
    partAEl.innerHTML = '&mdash;';
    partBEl.innerHTML = '&mdash;';
    partADetail.textContent = '';
    partBDetail.textContent = '';
    breakdownSection.style.display = 'none';
    return;
  }

  const calc = calculateMUKRS(tournaments);

  mukrsEl.textContent = calc.mukrs.toFixed(2);
  partAEl.textContent = calc.partA.toFixed(2);
  partBEl.textContent = calc.partB.toFixed(2);
  partADetail.textContent = `top ${calc.keepA} of ${calc.totalResults} results`;
  partBDetail.textContent = `top ${calc.keepB} results`;

  breakdownSection.style.display = 'block';
  renderBreakdown(calc);
}

function renderBreakdown(calc) {
  const tbody = document.getElementById('bd-tbody');
  let html = '';

  calc.sorted.forEach((r, i) => {
    const inA = calc.partASet.has(i);
    const inB = calc.partBSet.has(i);
    const dropped = calc.droppedASet.has(i);

    let classes = [];
    if (inA && !inB) classes.push('part-a');
    else if (inB && inA) classes.push('part-b');
    else if (dropped) classes.push('dropped');
    if (r.isPlaceholder) classes.push('placeholder');

    const src = r.isPlaceholder ? 'placeholder' : r.source;
    const aMark = inA ? '&#10003;' : (dropped ? '&#10007;' : '');
    const bMark = inB ? '&#10003;' : '';

    html += `<tr class="${classes.join(' ')}">
      <td>${i + 1}</td>
      <td>${r.score}</td>
      <td>${src}</td>
      <td>${aMark}</td>
      <td>${bMark}</td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

function toggleBreakdown() {
  const content = document.getElementById('bd-content');
  const arrow = document.getElementById('bd-arrow');
  content.classList.toggle('open');
  arrow.classList.toggle('open');
}

function recalcTarget() {
  const targetInput = document.getElementById('target-input');
  const nextDaysInput = document.getElementById('next-days-input');
  const resultArea = document.getElementById('target-result-area');

  const target = parseFloat(targetInput.value);
  const days = parseInt(nextDaysInput.value) || 1;

  if (isNaN(target) || tournaments.length === 0) {
    resultArea.style.display = 'none';
    return;
  }

  resultArea.style.display = 'block';

  const currentCalc = calculateMUKRS(tournaments);
  const result = findRequiredScore(tournaments, target, days);

  const box = document.getElementById('target-result-box');
  const trLabel = document.getElementById('tr-label');
  const trValue = document.getElementById('tr-value');
  const trDesc = document.getElementById('tr-desc');

  // Gauge
  const gaugeFill = document.getElementById('gauge-fill');
  const gaugeMarker = document.getElementById('gauge-marker');
  const gaugeCurrent = document.getElementById('gauge-current');
  const gaugeTarget = document.getElementById('gauge-target');

  const pct = Math.min(100, (currentCalc.mukrs / 1000) * 100);
  const targetPct = Math.min(100, (target / 1000) * 100);
  gaugeFill.style.width = pct + '%';
  gaugeMarker.style.left = targetPct + '%';
  gaugeCurrent.textContent = `Current: ${currentCalc.mukrs.toFixed(2)}`;
  gaugeTarget.textContent = `Target: ${target}`;

  const newPartsArea = document.getElementById('new-mukrs-parts');
  const positionSection = document.getElementById('position-section');
  const posValue = document.getElementById('pos-value');
  const posDetail = document.getElementById('pos-detail');
  const playersInput = document.getElementById('players-input');
  const players = parseInt(playersInput.value);

  const hasPlayers = !isNaN(players) && players >= 2;

  if (result.status === 'impossible') {
    box.className = 'target-result impossible';
    trLabel.textContent = 'Not achievable';
    trValue.textContent = '&#10005;';
    trValue.innerHTML = '&#10005;';
    trDesc.textContent = `Even scoring 1000 for ${days} day${days > 1 ? 's' : ''} only reaches ${result.maxMUKRS.toFixed(2)}`;
    newPartsArea.style.display = 'none';
    positionSection.style.display = 'none';
  } else if (result.status === 'already') {
    box.className = 'target-result already';
    trLabel.textContent = 'Target already reached!';
    trValue.textContent = '0+';
    trDesc.textContent = `Even a score of 0 keeps you above ${target}`;
    newPartsArea.style.display = 'none';
    if (hasPlayers) {
      positionSection.style.display = 'block';
      posValue.innerHTML = `1st <span class="pos-out-of">or better</span>`;
      posDetail.textContent = `Any position in a ${players}-player tournament`;
    } else {
      positionSection.style.display = 'none';
    }
  } else {
    const needed = result.score;
    const rounded = Math.ceil(needed);
    box.className = 'target-result needed';
    trLabel.textContent = 'Score needed per day';
    if (rounded === needed || Math.abs(rounded - needed) < 0.01) {
      trValue.textContent = rounded;
    } else {
      trValue.textContent = needed.toFixed(1);
    }
    trDesc.textContent = `Score at least ${rounded} in a ${days}-day tournament to reach MUKRS ${target}`;

    // Show new breakdown
    const newCalc = calculateMUKRSWithExtra(tournaments, rounded, days);
    newPartsArea.style.display = 'block';
    document.getElementById('new-part-a-value').textContent = newCalc.partA.toFixed(2);
    document.getElementById('new-part-b-value').textContent = newCalc.partB.toFixed(2);
    document.getElementById('new-part-a-detail').textContent = `top ${newCalc.keepA} of ${newCalc.totalResults}`;
    document.getElementById('new-part-b-detail').textContent = `top ${newCalc.keepB} results`;

    // Position estimate
    if (hasPlayers) {
      positionSection.style.display = 'block';
      const pos = scoreToPosition(rounded, players);
      const exactScore = positionToScore(pos, players);
      posValue.innerHTML = `${formatPosition(pos)} <span class="pos-out-of">of ${players}</span>`;
      if (Math.abs(exactScore - rounded) > 1) {
        posDetail.textContent = `${formatPosition(pos)} place gives a score of ${exactScore.toFixed(0)} (need ${rounded})`;
      } else {
        posDetail.textContent = `${formatPosition(pos)} place gives a score of ${exactScore.toFixed(0)}`;
      }
    } else {
      positionSection.style.display = 'none';
    }
  }

  // Scenarios
  renderScenarios(days, target, hasPlayers ? players : 0);
}

function renderScenarios(days, target, players) {
  const grid = document.getElementById('scenario-grid');
  const scenarioNote = document.getElementById('scenario-note');
  const scores = [0, 200, 400, 500, 600, 700, 800, 900, 1000];

  if (players >= 2) {
    scenarioNote.textContent = `(position shown for ${players} players)`;
  } else {
    scenarioNote.textContent = '';
  }

  let html = '';
  for (const s of scores) {
    const calc = calculateMUKRSWithExtra(tournaments, s, days);
    const hit = calc.mukrs >= target;
    const posHtml = players >= 2
      ? `<div class="si-pos">${formatPosition(scoreToPosition(s, players))} place</div>`
      : '';
    html += `<div class="scenario-item${hit ? ' hit' : ''}">
      <div class="si-score">${s}</div>
      <div class="si-mukrs">${calc.mukrs.toFixed(1)}</div>
      ${posHtml}
    </div>`;
  }
  grid.innerHTML = html;
}

// ── Actions ────────────────────────────────────────────────────────
function addResult() {
  const scoreInput = document.getElementById('score-input');
  const daysInput = document.getElementById('days-input');

  const score = parseInt(scoreInput.value);
  const days = parseInt(daysInput.value);

  if (isNaN(score) || score < 0 || score > 1000) {
    notify('Please enter a score between 0 and 1000');
    scoreInput.focus();
    return;
  }

  if (isNaN(days) || days < 1 || days > 10) {
    notify('Please enter tournament days between 1 and 10');
    daysInput.focus();
    return;
  }

  tournaments.push({ score, days, id: nextId++ });
  scoreInput.value = '';
  scoreInput.focus();
  render();
}

function removeResult(id) {
  tournaments = tournaments.filter(t => t.id !== id);
  render();
}

function clearAll() {
  if (tournaments.length > 0 && confirm('Remove all tournament results?')) {
    tournaments = [];
    render();
  }
}

function exportResults() {
  const json = JSON.stringify(tournaments, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mukrs-results.json';
  a.click();
  URL.revokeObjectURL(url);
  notify('Results exported');
}

function importResults() {
  document.getElementById('import-file').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) {
        tournaments = data.map(t => ({
          score: Number(t.score) || 0,
          days: Number(t.days) || 1,
          name: t.name || '',
          id: nextId++
        }));
        render();
        notify(`Imported ${tournaments.length} tournament results`);
      } else {
        notify('Invalid file format');
      }
    } catch (err) {
      notify('Failed to parse file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function loadExample() {
  tournaments = [
    { score: 550, days: 3, id: nextId++ },
    { score: 850, days: 2, id: nextId++ },
    { score: 300, days: 2, id: nextId++ },
    { score: 900, days: 3, id: nextId++ },
    { score: 400, days: 2, id: nextId++ },
    { score: 600, days: 1, id: nextId++ },
  ];
  render();
  notify('Loaded worked example from MUKRS page');
}

// ── Paste Parser ───────────────────────────────────────────────────
// Expects plain text with rows of 5 columns: Tournament, Location, Date, Days, Base Rank
// Values can be separated by newlines (one value per line, 5 lines per record)
// or by tabs (one row per tournament)
function parsePaste() {
  const textarea = document.getElementById('paste-input');
  const preview = document.getElementById('paste-preview');
  const text = textarea.value.trim();

  if (!text) {
    preview.textContent = 'Paste some text first';
    preview.className = 'paste-preview error';
    return;
  }

  const results = [];

  // Strategy 1: Tab-separated rows (each line = one tournament with tab-separated columns)
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const tabRows = lines.filter(l => l.includes('\t'));

  if (tabRows.length >= 1) {
    for (const line of tabRows) {
      const cols = line.split('\t').map(c => c.trim());
      if (cols.length >= 5) {
        const days = parseInt(cols[3]);
        const score = parseInt(cols[4]);
        if (!isNaN(days) && !isNaN(score) && days >= 1 && score >= 0 && score <= 1000) {
          results.push({ score, days, name: cols[0], id: nextId++ });
        }
      }
    }
  }

  // Strategy 2: All-values-on-separate-lines format (every 5 lines = 1 record)
  if (results.length === 0 && lines.length >= 5) {
    // Find the first line that looks like a number (skip header)
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const n = parseInt(lines[i]);
      if (!isNaN(n) && n >= 1 && n <= 10) {
        // This could be a "Days" value; the line after should be the Base Rank
        const possibleDays = n;
        const possibleScore = parseInt(lines[i + 1]);
        if (!isNaN(possibleScore) && possibleScore >= 0 && possibleScore <= 1000) {
          // Found the pattern. Work backwards: Days at i, Score at i+1
          // The record structure is: Tournament(i-4), Location(i-3), Date(i-2), Days(i), Score(i+1)
          // Wait - the structure is 5 columns per record:
          // col0=Tournament, col1=Location, col2=Date, col3=Days, col4=Base Rank
          // So in flat lines: record starts at some index, every 5 lines = 1 record
          break;
        }
      }
    }

    // Try to detect column structure from header
    // The text has a header row of: Tournament, Location, Date, Days, Base Rank
    // Then each record is 5 lines
    // Find header by looking for known column names
    const headerKeywords = ['tournament', 'location', 'date', 'days', 'base rank', 'score'];
    let headerStart = -1;
    let headerCols = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const lower = lines[i].toLowerCase();
      if (headerKeywords.some(kw => lower.includes(kw))) {
        headerStart = i;
        // Count consecutive header-like lines
        headerCols = 0;
        for (let j = i; j < lines.length; j++) {
          const l = lines[j].toLowerCase();
          if (headerKeywords.some(kw => l.includes(kw)) || isNaN(parseInt(lines[j])) === false) {
            headerCols++;
          }
          // Check if we've passed the header
          const isHeaderWord = headerKeywords.some(kw => l.includes(kw));
          if (!isHeaderWord && j > i) {
            headerCols = j - i;
            break;
          }
        }
        break;
      }
    }

    // Simplest approach: detect if lines follow a pattern of 5-line blocks
    // Skip any header, then parse 5-line blocks
    // Detect the number of header lines by looking for "Days" or "Base Rank" keywords
    let skipLines = 0;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const lower = lines[i].toLowerCase();
      if (lower.includes('days') || lower.includes('base rank') || lower.includes('location') || lower.includes('tournament')) {
        skipLines = i + 1;
      }
    }

    const dataLines = lines.slice(skipLines);

    // Try 5-line blocks
    for (let i = 0; i + 4 < dataLines.length; i += 5) {
      const days = parseInt(dataLines[i + 3]);
      const score = parseInt(dataLines[i + 4]);
      if (!isNaN(days) && !isNaN(score) && days >= 1 && days <= 10 && score >= 0 && score <= 1000) {
        results.push({ score, days, name: dataLines[i], id: nextId++ });
      }
    }

    // If 5-line blocks didn't work, try detecting variable-length blocks
    // by scanning for (Days, BaseRank) number pairs
    if (results.length === 0) {
      for (let i = 0; i < dataLines.length - 1; i++) {
        const possibleDays = parseInt(dataLines[i]);
        const possibleScore = parseInt(dataLines[i + 1]);
        if (!isNaN(possibleDays) && !isNaN(possibleScore) &&
            possibleDays >= 1 && possibleDays <= 10 &&
            possibleScore >= 0 && possibleScore <= 1000 &&
            // Make sure the previous line isn't a number (it should be a date string)
            (i === 0 || isNaN(parseInt(dataLines[i - 1])))) {
          // Walk back to find the tournament name (3 lines back: name, location, date)
          const name = i >= 3 ? dataLines[i - 3] : `Tournament ${results.length + 1}`;
          results.push({ score: possibleScore, days: possibleDays, name, id: nextId++ });
          i++; // skip the score line
        }
      }
    }
  }

  if (results.length > 0) {
    tournaments = tournaments.concat(results);
    render();
    preview.textContent = `Found ${results.length} tournament${results.length > 1 ? 's' : ''}`;
    preview.className = 'paste-preview success';
    textarea.value = '';
    notify(`Imported ${results.length} tournament${results.length > 1 ? 's' : ''} from paste`);
  } else {
    preview.textContent = 'Could not find any tournament data. Expected: Tournament / Location / Date / Days / Base Rank';
    preview.className = 'paste-preview error';
  }
}

function notify(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────
document.getElementById('score-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') addResult();
});
document.getElementById('days-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') addResult();
});

// ── Theme ──────────────────────────────────────────────────────────
function getPreferredTheme() {
  const stored = localStorage.getItem('mukrs_theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0f1117' : '#1a7a4c';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mukrs_theme', next);
  applyTheme(next);
}

applyTheme(getPreferredTheme());

// ── Share URL ──────────────────────────────────────────────────────
function encodeState() {
  const data = tournaments.map(t => ({ s: t.score, d: t.days, n: t.name || '' }));
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  } catch (e) { return ''; }
}

function updateHash() {
  if (tournaments.length > 0) {
    location.hash = encodeState();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function loadFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return false;
  try {
    const json = decodeURIComponent(escape(atob(hash)));
    const data = JSON.parse(json);
    if (Array.isArray(data) && data.length > 0) {
      tournaments = data.map(t => ({
        score: Number(t.s) || 0,
        days: Number(t.d) || 1,
        name: t.n || '',
        id: nextId++
      }));
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

function shareUrl() {
  updateHash();
  const url = location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => notify('Link copied to clipboard'));
  } else {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    notify('Link copied to clipboard');
  }
}

// ── Compare Plans ──────────────────────────────────────────────────
function recalcCompare() {
  const emptyEl = document.getElementById('compare-empty');
  const colA = document.getElementById('plan-a-col');
  const colB = document.getElementById('plan-b-col');

  if (tournaments.length === 0) {
    emptyEl.style.display = 'block';
    colA.style.display = 'none';
    colB.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  colA.style.display = 'block';
  colB.style.display = 'block';

  const aDays = parseInt(document.getElementById('plan-a-days').value) || 1;
  const aScore = parseInt(document.getElementById('plan-a-score').value);
  const aPlayers = parseInt(document.getElementById('plan-a-players').value);
  const bDays = parseInt(document.getElementById('plan-b-days').value) || 1;
  const bScore = parseInt(document.getElementById('plan-b-score').value);
  const bPlayers = parseInt(document.getElementById('plan-b-players').value);

  const hasA = !isNaN(aScore);
  const hasB = !isNaN(bScore);

  const mukrsAEl = document.getElementById('plan-a-mukrs');
  const mukrsBEl = document.getElementById('plan-b-mukrs');
  const partsAEl = document.getElementById('plan-a-parts');
  const partsBEl = document.getElementById('plan-b-parts');
  const titleAEl = document.getElementById('plan-a-title');
  const titleBEl = document.getElementById('plan-b-title');

  let aCalc = null, bCalc = null;
  const posACard = document.getElementById('plan-a-pos-card');
  const posBCard = document.getElementById('plan-b-pos-card');
  const posAValue = document.getElementById('plan-a-pos-value');
  const posBValue = document.getElementById('plan-b-pos-value');

  if (hasA) {
    aCalc = calculateMUKRSWithExtra(tournaments, aScore, aDays);
    mukrsAEl.textContent = aCalc.mukrs.toFixed(2);
    partsAEl.innerHTML = `A: ${aCalc.partA.toFixed(1)} &middot; B: ${aCalc.partB.toFixed(1)}`;
    if (!isNaN(aPlayers) && aPlayers >= 2) {
      posACard.style.display = 'block';
      posAValue.innerHTML = `${formatPosition(scoreToPosition(aScore, aPlayers))} <span style="font-size:0.9rem;font-weight:500;color:var(--text-muted);">of ${aPlayers}</span>`;
    } else {
      posACard.style.display = 'none';
    }
  } else {
    mukrsAEl.innerHTML = '&mdash;';
    partsAEl.innerHTML = '';
    posACard.style.display = 'none';
  }

  if (hasB) {
    bCalc = calculateMUKRSWithExtra(tournaments, bScore, bDays);
    mukrsBEl.textContent = bCalc.mukrs.toFixed(2);
    partsBEl.innerHTML = `A: ${bCalc.partA.toFixed(1)} &middot; B: ${bCalc.partB.toFixed(1)}`;
    if (!isNaN(bPlayers) && bPlayers >= 2) {
      posBCard.style.display = 'block';
      posBValue.innerHTML = `${formatPosition(scoreToPosition(bScore, bPlayers))} <span style="font-size:0.9rem;font-weight:500;color:var(--text-muted);">of ${bPlayers}</span>`;
    } else {
      posBCard.style.display = 'none';
    }
  } else {
    mukrsBEl.innerHTML = '&mdash;';
    partsBEl.innerHTML = '';
    posBCard.style.display = 'none';
  }

  // Highlight winner
  colA.classList.remove('winner');
  colB.classList.remove('winner');
  titleAEl.innerHTML = 'Plan A';
  titleBEl.innerHTML = 'Plan B';

  if (aCalc && bCalc) {
    if (aCalc.mukrs > bCalc.mukrs) {
      colA.classList.add('winner');
      titleAEl.innerHTML = 'Plan A <span class="badge">Better</span>';
    } else if (bCalc.mukrs > aCalc.mukrs) {
      colB.classList.add('winner');
      titleBEl.innerHTML = 'Plan B <span class="badge">Better</span>';
    }
  }
}

// ── Service Worker ─────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Init ───────────────────────────────────────────────────────────
loadedFromHash = loadFromHash();
if (!loadedFromHash) loadState();
render();
