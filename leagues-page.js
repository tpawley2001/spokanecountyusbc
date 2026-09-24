// leagues.html page script (uses helpers from leagues.js)
(async function () {
  const slug = currentLeagueSlug();
  try {
    const [index, data] = await Promise.all([loadLeagueIndex(), loadLeagueData(slug)]);
    const { lane_assignments, teams, league } = data;

    // League picker
    document.getElementById('league-tabs').innerHTML = index.leagues.map(l =>
      `<a class="btn ${l.slug === slug ? 'btn-primary' : 'btn-outline-navy'}" href="leagues.html?league=${encodeURIComponent(l.slug)}#spotlight">${escapeHtml(l.name)}</a>`
    ).join(' ');

    document.getElementById('spotlight-title').textContent = league.name;
    document.getElementById('spotlight-meta').textContent =
      [league.center, league.day_time, league.lanes ? `Lanes ${league.lanes}` : null].filter(Boolean).join(' · ');

    const asOf = data.as_of && data.as_of.week
      ? ` · Standings through week ${data.as_of.week}${data.as_of.date ? ' (' + escapeHtml(data.as_of.date) + ')' : ''}` : '';
    document.getElementById('league-info').innerHTML = `
      <h4>League Info</h4>
      <p>${teams.length} teams${league.total_weeks ? ` · ${league.total_weeks}-week season` : ''}${league.scoring === 'scratch' ? ' · Scratch' : ''}${asOf}. Results come from the league's weekly ${escapeHtml(league.source || 'recap sheets')}.</p>
    `;

    document.getElementById('lane-assignments-heading').textContent =
      `Lane Assignments — Week ${lane_assignments.week_num ?? '?'}${lane_assignments.date ? ' (' + lane_assignments.date + ')' : ''}`;
    document.getElementById('lane-assignments-body').innerHTML = (lane_assignments.lanes || [])
      .map(l => `<tr><td>${l.lane_number}</td><td><a href="${teamUrl(slug, l.team_id)}">${escapeHtml(l.team_name)}</a></td></tr>`)
      .join('') || '<tr><td colspan="2">Not posted yet.</td></tr>';

    const head = document.getElementById('standings-head');
    const body = document.getElementById('standings-body');
    if (data.standings && data.standings.length) {
      // Official standings from the recap sheet
      document.getElementById('standings-heading').textContent = `Team Standings — through Week ${data.as_of.week}`;
      head.innerHTML = '<tr><th>Place</th><th>Team</th><th>Won</th><th>Lost</th><th>% Won</th><th>Scratch Pins</th></tr>';
      body.innerHTML = data.standings.map(s => `
        <tr>
          <td>${s.place}</td>
          <td><a href="${teamUrl(slug, s.team_id)}"><strong>${escapeHtml(s.team_name)}</strong></a></td>
          <td>${formatPoints(s.points_won)}</td>
          <td>${formatPoints(s.points_lost)}</td>
          <td>${s.pct_won != null ? Number(s.pct_won).toFixed(1) : ''}</td>
          <td>${s.scratch_pins ?? ''}</td>
        </tr>`).join('');
    } else {
      const standings = teams.map(team => {
        const wk = latestWeekNum(team);
        const week = team.weeks[wk];
        return { team, wk, week, series: teamSeriesTotal(week) };
      }).sort((a, b) => (b.week.points_won - a.week.points_won) || (b.series - a.series));
      if (standings.length) {
        document.getElementById('standings-heading').textContent = `Team Standings — Week ${standings[0].wk} Results`;
      }
      head.innerHTML = '<tr><th>Team</th><th>Lane Bowled On</th><th>Points Won</th><th>Team Scratch Series</th></tr>';
      body.innerHTML = standings.map(({ team, week, series }) => `
        <tr>
          <td><a href="${teamUrl(slug, team.team_id)}"><strong>${escapeHtml(team.team_name)}</strong></a></td>
          <td>${week.lane_bowled_on ?? ''}</td>
          <td>${pointsBadge(week.points_won)}</td>
          <td>${series}</td>
        </tr>`).join('');
    }
  } catch (err) {
    document.getElementById('standings-body').innerHTML =
      `<tr><td colspan="6">Could not load league data: ${escapeHtml(err.message)}</td></tr>`;
  }
})();
