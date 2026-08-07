// Seating chart — pure model logic. No DOM, no storage, no pdf-lib.
// Everything here is data-in/data-out and unit-tested in test/model.test.mjs.
//
// The product insight (see 02-local-data-to-pdf.md): seating is a CONSTRAINT
// problem re-solved a dozen times as RSVPs trickle in. The user declares rules;
// whenever the data changes we re-validate and SURFACE what broke — we never
// silently leave a hole.

export function newId() {
  try { return crypto.randomUUID().slice(0, 8); }
  catch (e) { return Math.random().toString(36).slice(2, 10); }
}

export function newProject(name) {
  return {
    v: 1,
    id: newId(),
    name: name || 'Untitled event',
    guests: [],        // {id, name, party, meal, tags[], rsvp:'yes'|'no'|'unknown', notes}
    tables: [],        // {id, label, shape:'round'|'rect'|'head', seats, x, y}
    rules: [],         // {id, type:'together'|'apart'|'mustTable', guestIds[], tableId?}
    assignments: {},   // guestId -> tableId
    updatedAt: 0,
  };
}

/* ---------- import parsing ---------- */

// Split one CSV-ish line honoring double quotes.
export function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === '\t') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/* Paste-a-column / CSV import. Accepted per line:
     Name
     Name, party
     Name, party, meal
     Name, party, meal, tags (semicolon- or space-separated)
   A leading header row ("name,party,...") is skipped. */
export function parseGuestPaste(text, idFn) {
  const mk = idFn || newId;
  const out = [];
  if (typeof text !== 'string') return out;
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li].trim();
    if (!raw) continue;
    const cells = splitCsvLine(raw);
    if (li === 0 && /^name$/i.test(cells[0] || '')) continue; // header row
    const name = (cells[0] || '').slice(0, 80);
    if (!name) continue;
    out.push({
      id: mk(),
      name,
      party: (cells[1] || '').slice(0, 60),
      meal: (cells[2] || '').slice(0, 40),
      tags: (cells[3] || '').split(/[;]+/).map(t => t.trim()).filter(Boolean).slice(0, 8),
      rsvp: 'unknown',
      notes: '',
    });
    if (out.length >= 1000) break;
  }
  return out;
}

export function lastNameOf(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
}

/* ---------- occupancy ---------- */

export function tableOccupants(project, tableId) {
  return project.guests.filter(g => project.assignments[g.id] === tableId);
}

export function occupancy(project) {
  const map = Object.create(null);
  for (const t of project.tables) map[t.id] = [];
  for (const g of project.guests) {
    const tid = project.assignments[g.id];
    if (tid && map[tid]) map[tid].push(g);
  }
  return map;
}

export function unassignedGuests(project) {
  return project.guests.filter(g => g.rsvp !== 'no' && !project.assignments[g.id]);
}

/* ---------- validation: surface every broken thing as a fixable item ---------- */

export function validate(project) {
  const violations = [];
  const nameOf = Object.create(null);
  const tableOf = Object.create(null);
  for (const g of project.guests) nameOf[g.id] = g.name;
  const tableLabel = Object.create(null);
  for (const t of project.tables) tableLabel[t.id] = t.label;

  // stale assignments (guest deleted from a table, table deleted, RSVP flipped to no)
  const occ = occupancy(project);
  for (const g of project.guests) {
    const tid = project.assignments[g.id];
    if (tid && !tableLabel[tid]) {
      violations.push({ kind: 'stale', message: `${g.name} is assigned to a table that no longer exists.`, guestIds: [g.id] });
    } else if (tid) {
      tableOf[g.id] = tid;
    }
    if (tid && g.rsvp === 'no') {
      violations.push({ kind: 'rsvp', message: `${g.name} declined but still has a seat at ${tableLabel[tid]}.`, guestIds: [g.id], tableId: tid });
    }
  }

  // capacity
  for (const t of project.tables) {
    const n = (occ[t.id] || []).filter(g => g.rsvp !== 'no').length;
    if (n > t.seats) {
      violations.push({ kind: 'capacity', message: `${t.label} has ${n} people for ${t.seats} seats.`, tableId: t.id });
    }
  }

  // rules
  for (const r of project.rules) {
    const ids = r.guestIds.filter(id => nameOf[id]);
    if (r.type === 'together') {
      const tables = new Set(ids.map(id => tableOf[id]).filter(Boolean));
      if (tables.size > 1) {
        violations.push({ kind: 'together', ruleId: r.id, guestIds: ids,
          message: ids.map(id => nameOf[id]).join(' & ') + ' should sit together but are split across tables.' });
      }
    } else if (r.type === 'apart') {
      const seen = Object.create(null);
      for (const id of ids) {
        const tid = tableOf[id];
        if (!tid) continue;
        if (seen[tid]) {
          violations.push({ kind: 'apart', ruleId: r.id, guestIds: [seen[tid], id], tableId: tid,
            message: nameOf[seen[tid]] + ' and ' + nameOf[id] + ' should be kept apart but are both at ' + tableLabel[tid] + '.' });
        } else seen[tid] = id;
      }
    } else if (r.type === 'mustTable') {
      for (const id of ids) {
        const tid = tableOf[id];
        if (tid && tid !== r.tableId) {
          violations.push({ kind: 'mustTable', ruleId: r.id, guestIds: [id], tableId: r.tableId,
            message: nameOf[id] + ' must be at ' + (tableLabel[r.tableId] || 'a deleted table') + ' but is at ' + tableLabel[tid] + '.' });
        }
      }
    }
  }
  return violations;
}

/* Would placing guestId at tableId introduce any NEW violation? (Clearing an
   old violation never licenses creating a different one — comparing counts
   would let a stale-assignment fix overfill a table.) */
export function placementOk(project, guestId, tableId) {
  const key = (v) => v.kind + '|' + (v.tableId || '') + '|' + (v.guestIds || []).slice().sort().join(',');
  const before = new Set(validate(project).map(key));
  const trial = { ...project, assignments: { ...project.assignments, [guestId]: tableId } };
  return validate(trial).every(v => before.has(key(v)));
}

/* ---------- auto-arrange: a SUGGESTION, never the primary mode ---------- */

export function autoArrange(project) {
  const assignments = {};
  const seatsLeft = Object.create(null);
  for (const t of project.tables) seatsLeft[t.id] = t.seats;

  const attending = project.guests.filter(g => g.rsvp !== 'no');
  const byId = Object.create(null);
  for (const g of attending) byId[g.id] = g;

  // must-table pins first
  for (const r of project.rules) {
    if (r.type !== 'mustTable') continue;
    for (const id of r.guestIds) {
      if (byId[id] && seatsLeft[r.tableId] > 0 && !assignments[id]) {
        assignments[id] = r.tableId;
        seatsLeft[r.tableId]--;
      }
    }
  }

  // union together-rules and parties into groups
  const groupOf = Object.create(null);
  const groups = [];
  function makeGroup(ids) {
    const g = { ids: [], size: 0 };
    groups.push(g);
    for (const id of ids) addTo(g, id);
    return g;
  }
  function addTo(g, id) {
    if (!byId[id] || groupOf[id]) return;
    groupOf[id] = g;
    g.ids.push(id);
    g.size++;
  }
  // merge: when a rule/party spans members of DIFFERENT existing groups,
  // union them — otherwise "A+B", "C+D", then "B+C" leaves B and C split
  function mergeInto(target, other) {
    if (target === other) return;
    for (const id of other.ids) { groupOf[id] = target; target.ids.push(id); target.size++; }
    other.ids = []; other.size = 0;
  }
  function unionIds(ids) {
    const existing = [...new Set(ids.map(id => groupOf[id]).filter(Boolean))];
    if (existing.length === 0) { makeGroup(ids); return; }
    const target = existing[0];
    for (const g of existing.slice(1)) mergeInto(target, g);
    for (const id of ids) addTo(target, id);
  }
  const partyMap = Object.create(null);
  for (const g of attending) {
    if (g.party) (partyMap[g.party] = partyMap[g.party] || []).push(g.id);
  }
  for (const r of project.rules) {
    if (r.type !== 'together') continue;
    unionIds(r.guestIds.filter(id => byId[id]));
  }
  for (const party of Object.keys(partyMap)) unionIds(partyMap[party]);
  for (const g of attending) if (!groupOf[g.id]) makeGroup([g.id]);

  // apart lookup: guestId -> Set of guests they must avoid
  const avoid = Object.create(null);
  for (const r of project.rules) {
    if (r.type !== 'apart') continue;
    for (const a of r.guestIds) for (const b of r.guestIds) {
      if (a === b) continue;
      (avoid[a] = avoid[a] || new Set()).add(b);
    }
  }
  const tableHasAvoided = (tableId, ids, placed) => {
    const there = Object.keys(placed).filter(id => placed[id] === tableId);
    for (const id of ids) {
      const av = avoid[id];
      if (!av) continue;
      if (there.some(o => av.has(o))) return true;
      if (ids.some(o => o !== id && av.has(o))) return true; // conflict inside the group
    }
    return false;
  };

  // place groups, biggest first; pin to a member's pre-assigned table when present
  const ordered = [...groups].sort((a, b) => b.size - a.size);
  const tables = [...project.tables];
  for (const grp of ordered) {
    const remaining = grp.ids.filter(id => !assignments[id]);
    if (remaining.length === 0) continue;
    const pinned = grp.ids.map(id => assignments[id]).find(Boolean);
    let placedAny = false;
    const candidates = pinned
      ? [tables.find(t => t.id === pinned), ...tables].filter(Boolean)
      : [...tables].sort((a, b) => seatsLeft[b.id] - seatsLeft[a.id]);
    for (const t of candidates) {
      if (seatsLeft[t.id] >= remaining.length && !tableHasAvoided(t.id, remaining, assignments)) {
        for (const id of remaining) { assignments[id] = t.id; seatsLeft[t.id]--; }
        placedAny = true;
        break;
      }
    }
    if (!placedAny) {
      // no single table fits the whole group — split it across the emptiest tables
      for (const id of remaining) {
        const best = [...tables].sort((a, b) => seatsLeft[b.id] - seatsLeft[a.id])
          .find(t => seatsLeft[t.id] > 0 && !tableHasAvoided(t.id, [id], assignments));
        if (best) { assignments[id] = best.id; seatsLeft[best.id]--; }
      }
    }
  }
  return assignments;
}

/* ---------- caterer math ---------- */

export function mealSummary(project) {
  const totals = Object.create(null);
  let total = 0;
  const perTable = [];
  const occ = occupancy(project);
  const countGroup = (table, guests) => {
    const meals = Object.create(null);
    for (const g of guests) {
      const m = g.meal || 'Unspecified';
      meals[m] = (meals[m] || 0) + 1;
      totals[m] = (totals[m] || 0) + 1;
      total++;
    }
    perTable.push({ table, guests, meals });
  };
  for (const t of project.tables) {
    countGroup(t, (occ[t.id] || []).filter(g => g.rsvp !== 'no'));
  }
  // The kitchen cooks for everyone attending — unseated stragglers included.
  // Dropping them would make the caterer's sheet quietly undercount meals.
  const unseated = unassignedGuests(project);
  if (unseated.length) countGroup({ id: '', label: 'Not yet seated' }, unseated);
  return { perTable, totals, total };
}
