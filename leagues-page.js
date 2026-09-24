// leagues.html page script (uses helpers from leagues.js)
(async function () {
  try {
    const data = await loadLeagueData();
    const { lane_assignments, teams, league } = data;

    document.getElementById('league-info').innerHTML = `
      <h4>League Info</h4>
      <p>${teams.length} teams · Fall ${lane_assignments.year || ''} season · League Secretary ID ${league.id} · Bowls weekly at ${escapeHtml(league.center)}.</p>
    `;

    document.getElementById('lane-assignments-heading').textContent =
      `Lane Assignments — Week ${lane_assignments.week_num ?? '?'}`;

    const laneBody = document.getElementById('lane-assignments-body');
    laneBody.innerHTML = (lane_assignments.lanes || [])
      .map(l => `<tr><td>${l.lane_number}</td><td><a href="team.html?id=${l.team_id}">${escapeHtml(l.team_name)}</a></td></tr>`)
      .join('');

    const standings = teams.map(team => {
      const wk = latestWeekNum(team);
      const week = team.weeks[wk];
      return { team, wk, week, series: teamSeriesTotal(week) };
    }).sort((a, b) => (b.week.points_won - a.week.points_won) || (b.series - a.series));

    if (standings.length) {
      document.getElementById('standings-heading').textContent = `Team Standings — Week ${standings[0].wk} Results`;
    }

    document.getElementById('standings-body').innerHTML = standings.map(({ team, wk, week, series }) => `
      <tr>
        <td><a href="team.html?id=${team.team_id}"><strong>${escapeHtml(team.team_name)}</strong></a></td>
        <td>${week.lane_bowled_on ?? ''}</td>
        <td>${pointsBadge(week.points_won)}</td>
        <td>${series}</td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('standings-body').innerHTML =
      `<tr><td colspan="4">Could not load league data: ${escapeHtml(err.message)}</td></tr>`;
  }
})();
