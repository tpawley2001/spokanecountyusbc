// bowler.html page script (uses helpers from leagues.js)
(async function () {
  const params = new URLSearchParams(window.location.search);
  const bowlerName = params.get('name');
  const slug = currentLeagueSlug();
  const content = document.getElementById('bowler-content');
  const summary = document.getElementById('bowler-summary');
  const back = `leagues.html?league=${encodeURIComponent(slug)}#spotlight`;
  document.getElementById('bowler-back').innerHTML = `<a href="${back}">← Back to Leagues</a>`;

  if (!bowlerName) {
    document.getElementById('bowler-subtitle').textContent = 'No bowler selected.';
    content.innerHTML = `<p>Go back to <a href="${back}">Leagues</a> and pick a bowler from a team's results.</p>`;
    return;
  }

  try {
    const data = await loadLeagueData(slug);
    const scratch = data.league.scoring === 'scratch';

    // Find every week entry for this bowler, across every team (covers subbing).
    const appearances = [];
    for (const team of data.teams) {
      for (const wk of Object.keys(team.weeks).map(Number)) {
        const week = team.weeks[wk];
        const entry = week.bowlers.find(b => b.name === bowlerName);
        if (entry) {
          appearances.push({ wk, team, week, entry });
        }
      }
    }
    appearances.sort((a, b) => b.wk - a.wk);

    if (!appearances.length) {
      document.getElementById('bowler-name').textContent = bowlerName;
      document.getElementById('bowler-subtitle').textContent = 'Bowler not found.';
      summary.innerHTML = '<h4>Season Summary</h4><p>No results found for this bowler in the current data set.</p>';
      content.innerHTML = `<p>Go back to <a href="${back}">Leagues</a>.</p>`;
      return;
    }

    document.getElementById('bowler-name').textContent = bowlerName;
    document.getElementById('bowler-subtitle').textContent =
      [data.league.name, data.league.center].filter(Boolean).join(' — ') + ' — week-by-week results';

    const teamNames = [...new Set(appearances.map(a => a.team.team_name))];
    const allGames = appearances.flatMap(a => a.entry.games.map(g => parseInt(g, 10)).filter(n => !Number.isNaN(n)));
    const highGame = allGames.length ? Math.max(...allGames) : null;
    const highSeries = Math.max(...appearances.map(a => parseInt(a.entry.total, 10) || 0));
    const highHdcpSeries = scratch ? null : Math.max(...appearances.map(a => parseInt(a.entry.handicap_total, 10) || 0));
    const currentAverage = appearances[0].entry.average;

    summary.innerHTML = `
      <h4>Season Summary</h4>
      <p>
        Current average <strong>${escapeHtml(currentAverage)}</strong>
        · ${appearances.length} week${appearances.length === 1 ? '' : 's'} bowled
        · High game <strong>${highGame ?? '—'}</strong>
        · High series <strong>${highSeries || '—'}</strong>
        ${highHdcpSeries != null ? `· High hdcp series <strong>${highHdcpSeries || '—'}</strong>` : ''}
        ${teamNames.length > 1 ? `· Bowled for ${teamNames.length} teams this season` : ''}
      </p>
    `;

    content.innerHTML = appearances.map(({ wk, team, week, entry }) => {
      const numGames = entry.games.length;
      const gameHeaders = Array.from({ length: numGames }, (_, i) => `<th>Game ${i + 1}</th>`).join('');
      const gameCells = Array.from({ length: numGames }, (_, i) => `<td>${escapeHtml(entry.games[i] ?? '')}</td>`).join('');
      const hdcpCell = scratch ? '' : `<td>${escapeHtml(entry.handicap_total)}</td>`;

      return `
        <h3 style="color:var(--navy);margin-top:2rem;margin-bottom:0.5rem;">Week ${wk}</h3>
        <p class="section-meta">
          <a href="${teamUrl(slug, team.team_id)}">${escapeHtml(team.team_name)}</a>
          · Lane ${week.lane_bowled_on ?? '?'} · ${pointsBadge(week.points_won)}
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Avg</th>${gameHeaders}<th>Series</th>${scratch ? '' : '<th>Hdcp Series</th>'}</tr>
            </thead>
            <tbody>
              <tr><td>${escapeHtml(entry.average)}</td>${gameCells}<td>${escapeHtml(entry.total)}</td>${hdcpCell}</tr>
            </tbody>
          </table>
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('bowler-subtitle').textContent = 'Error loading data.';
    content.innerHTML = `<p>Could not load league data: ${escapeHtml(err.message)}</p>`;
  }
})();
