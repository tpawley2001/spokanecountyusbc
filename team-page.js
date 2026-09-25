// team.html page script (uses helpers from leagues.js)
(async function () {
  const params = new URLSearchParams(window.location.search);
  const teamId = parseInt(params.get('id'), 10);
  const slug = currentLeagueSlug();
  const content = document.getElementById('team-content');
  const back = `leagues.html?league=${encodeURIComponent(slug)}#spotlight`;

  if (!teamId) {
    document.getElementById('team-subtitle').textContent = 'No team selected.';
    content.innerHTML = `<p>Go back to <a href="${back}">Leagues</a> and pick a team from the standings table.</p>`;
    return;
  }

  try {
    const data = await loadLeagueData(slug);
    const team = data.teams.find(t => t.team_id === teamId);

    if (!team) {
      document.getElementById('team-subtitle').textContent = 'Team not found.';
      content.innerHTML = `<p>That team isn't in the current data set. Go back to <a href="${back}">Leagues</a>.</p>`;
      return;
    }

    document.getElementById('team-name').textContent = team.team_name;
    document.getElementById('team-subtitle').textContent =
      [data.league.name, data.league.center].filter(Boolean).join(' — ') + ' — week-by-week results';

    const weekNums = Object.keys(team.weeks).map(Number).sort((a, b) => b - a);
    const scratch = data.league.scoring === 'scratch';

    content.innerHTML = weekNums.map(wk => {
      const week = team.weeks[wk];
      const numGames = Math.max(...week.bowlers.map(b => b.games.length), 1);
      const gameHeaders = Array.from({ length: numGames }, (_, i) => `<th>Game ${i + 1}</th>`).join('');

      const rows = week.bowlers.map(b => {
        const gameCells = Array.from({ length: numGames }, (_, i) => `<td>${escapeHtml(b.games[i] ?? '')}</td>`).join('');
        const hdcpCell = scratch ? '' : `<td>${escapeHtml(b.handicap_total)}</td>`;
        const bowlerLink = `bowler.html?league=${encodeURIComponent(slug)}&name=${encodeURIComponent(b.name)}`;
        return `<tr><td><a href="${bowlerLink}">${escapeHtml(b.name)}</a></td><td>${escapeHtml(b.average)}</td>${gameCells}<td>${escapeHtml(b.total)}</td>${hdcpCell}</tr>`;
      }).join('');

      return `
        <h3 style="color:var(--navy);margin-top:2rem;margin-bottom:0.5rem;">Week ${wk}</h3>
        <p class="section-meta">Lane ${week.lane_bowled_on ?? '?'} · ${pointsBadge(week.points_won)}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Bowler</th><th>Avg</th>${gameHeaders}<th>Series</th>${scratch ? '' : '<th>Hdcp Series</th>'}</tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('team-subtitle').textContent = 'Error loading data.';
    content.innerHTML = `<p>Could not load league data: ${escapeHtml(err.message)}</p>`;
  }
})();
