/**
 * Options page: Tag Assistant — local command parser, preview, confirm, persist.
 */
(function () {
  'use strict';

  let pendingValidated = null;

  function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getAncestorIds(tagId, tagsList, visited = new Set()) {
    if (visited.has(tagId)) return [];
    visited.add(tagId);
    const tag = tagsList.find((x) => x.id === tagId);
    if (!tag || !tag.parentIds || tag.parentIds.length === 0) return [];
    const out = [];
    tag.parentIds.forEach((pid) => {
      out.push(pid, ...getAncestorIds(pid, tagsList, visited));
    });
    return out;
  }

  function canSetParents(childId, newParentIds, tagsList) {
    for (const pid of newParentIds) {
      if (!pid || pid === childId) return { ok: false, reason: 'Invalid parent' };
      const ancestorsOfParent = getAncestorIds(pid, tagsList);
      if (ancestorsOfParent.includes(childId)) {
        return { ok: false, reason: 'Cannot make a tag a parent of its own ancestor (cycle)' };
      }
    }
    return { ok: true };
  }

  function findTagByName(tagsList, name) {
    const n = (name || '').trim().toLowerCase();
    if (!n) return null;
    return tagsList.find((t) => t.name.toLowerCase() === n) || null;
  }

  function cloneState(tagsList, highlightsList) {
    return {
      tags: JSON.parse(JSON.stringify(tagsList || [])),
      highlights: JSON.parse(JSON.stringify(highlightsList || []))
    };
  }

  function splitTagList(s) {
    const str = String(s || '').trim();
    if (!str) return [];
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (c === ',' && !inQuote) {
        const t = cur.trim();
        if (t) out.push(t);
        cur = '';
        continue;
      }
      cur += c;
    }
    const t = cur.trim();
    if (t) out.push(t);
    return out;
  }

  function stripQuotes(s) {
    const x = String(s || '').trim();
    if (x.length >= 2 && x[0] === '"' && x[x.length - 1] === '"') return x.slice(1, -1);
    return x;
  }

  function parseCommands(text, tagsSnapshot) {
    const operations = [];
    const parseErrors = [];
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (lines.length === 0) {
      parseErrors.push('Enter at least one command (see Rules).');
      return { operations, parseErrors };
    }

    const tags = tagsSnapshot || [];

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;

      let m = line.match(/^delete\s+starting\s+with\s+(.+)$/i);
      if (m) {
        const prefix = stripQuotes(m[1].trim());
        if (!prefix) {
          parseErrors.push(`Line ${lineNo}: prefix after "delete starting with" is empty.`);
          return;
        }
        const re = new RegExp('^' + escapeRegex(prefix), 'i');
        const names = tags.filter((t) => re.test(t.name)).map((t) => t.name);
        if (names.length === 0) {
          parseErrors.push(`Line ${lineNo}: no tags found with names starting with "${prefix}".`);
          return;
        }
        operations.push({ op: 'delete', names });
        return;
      }

      m = line.match(/^create\s+parent\s+(.+?)\s+with\s+children\s+(.+)$/i);
      if (m) {
        const parentName = m[1].trim();
        const children = splitTagList(m[2]);
        if (!parentName) {
          parseErrors.push(`Line ${lineNo}: parent name is empty.`);
          return;
        }
        if (children.length === 0) {
          parseErrors.push(`Line ${lineNo}: list children after "with children".`);
          return;
        }
        const parentExists = !!findTagByName(tags, parentName);
        if (!parentExists) {
          operations.push({ op: 'create', name: parentName, parentNames: [], childNames: [] });
        }
        children.forEach((ch) => {
          if (findTagByName(tags, ch)) {
            operations.push({ op: 'update', name: ch, addParentsByName: [parentName] });
          } else {
            operations.push({ op: 'create', name: ch, parentNames: [parentName], childNames: [] });
          }
        });
        return;
      }

      m = line.match(/^set\s+parents\s+of\s+(.+?)\s+to\s+(.+)$/i);
      if (m) {
        const tagName = m[1].trim();
        const parents = splitTagList(m[2]);
        if (!tagName) {
          parseErrors.push(`Line ${lineNo}: tag name missing.`);
          return;
        }
        operations.push({ op: 'update', name: tagName, setParentsByName: parents });
        return;
      }

      m = line.match(/^set\s+children\s+of\s+(.+?)\s+to\s+(.+)$/i);
      if (m) {
        const tagName = m[1].trim();
        const children = splitTagList(m[2]);
        if (!tagName) {
          parseErrors.push(`Line ${lineNo}: tag name missing.`);
          return;
        }
        operations.push({ op: 'update', name: tagName, setChildrenByName: children });
        return;
      }

      m = line.match(/^add\s+parent\s+(.+?)\s+to\s+(.+)$/i);
      if (m) {
        operations.push({ op: 'update', name: m[2].trim(), addParentsByName: [m[1].trim()] });
        return;
      }

      m = line.match(/^remove\s+parent\s+(.+?)\s+from\s+(.+)$/i);
      if (m) {
        operations.push({ op: 'update', name: m[2].trim(), removeParentsByName: [m[1].trim()] });
        return;
      }

      m = line.match(/^add\s+children?\s+(.+?)\s+to\s+(.+)$/i);
      if (m) {
        const childList = splitTagList(m[1]);
        const parentName = m[2].trim();
        childList.forEach((ch) => {
          operations.push({ op: 'update', name: ch, addParentsByName: [parentName] });
        });
        return;
      }

      m = line.match(/^remove\s+children?\s+(.+?)\s+from\s+(.+)$/i);
      if (m) {
        const childList = splitTagList(m[1]);
        const parentName = m[2].trim();
        childList.forEach((ch) => {
          operations.push({ op: 'update', name: ch, removeParentsByName: [parentName] });
        });
        return;
      }

      m = line.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
      if (m) {
        operations.push({ op: 'update', name: m[1].trim(), newName: m[2].trim() });
        return;
      }

      m = line.match(/^set\s+color\s+(.+?)\s+(#[0-9a-fA-F]{3,8})$/i);
      if (m) {
        operations.push({ op: 'update', name: m[1].trim(), color: m[2] });
        return;
      }

      m = line.match(/^create\s+(.+)$/i);
      if (m) {
        const names = splitTagList(m[1]);
        if (names.length === 0) {
          parseErrors.push(`Line ${lineNo}: list tag names after "create".`);
          return;
        }
        names.forEach((n) => {
          operations.push({ op: 'create', name: n, parentNames: [], childNames: [] });
        });
        return;
      }

      m = line.match(/^delete\s+(.+)$/i);
      if (m) {
        const names = splitTagList(m[1]);
        if (names.length === 0) {
          parseErrors.push(`Line ${lineNo}: list tag names after "delete".`);
          return;
        }
        operations.push({ op: 'delete', names });
        return;
      }

      parseErrors.push(`Line ${lineNo}: unrecognized command. Check spelling and Rules above.`);
    });

    return { operations, parseErrors };
  }

  function simulateOperations(initialTags, initialHighlights, operations) {
    const errors = [];
    const warnings = [];
    const lines = [];
    const state = cloneState(initialTags, initialHighlights);
    const deleteNames = [];

    if (!Array.isArray(operations) || operations.length === 0) {
      return {
        ok: true,
        errors: [],
        warnings: ['No tag changes requested.'],
        lines: ['No changes to apply.'],
        state,
        deleteNames: [],
        noop: true
      };
    }

    for (let i = 0; i < operations.length; i++) {
      const raw = operations[i];
      if (!raw || typeof raw !== 'object' || !raw.op) {
        errors.push(`Step ${i + 1}: invalid operation (missing op).`);
        continue;
      }
      const op = String(raw.op).toLowerCase();

      if (op === 'create') {
        const name = String(raw.name || '').trim();
        if (!name) {
          errors.push(`Step ${i + 1} (create): name is required.`);
          continue;
        }
        if (findTagByName(state.tags, name)) {
          errors.push(`Step ${i + 1} (create): tag "${name}" already exists.`);
          continue;
        }
        const parentNames = Array.isArray(raw.parentNames) ? raw.parentNames.map((x) => String(x).trim()).filter(Boolean) : [];
        const childNames = Array.isArray(raw.childNames) ? raw.childNames.map((x) => String(x).trim()).filter(Boolean) : [];

        const parentIds = [];
        const stepErr = [];
        for (const pn of parentNames) {
          const p = findTagByName(state.tags, pn);
          if (!p) {
            stepErr.push(`parent tag "${pn}" does not exist — create it in an earlier step or fix the name.`);
          } else {
            parentIds.push(p.id);
          }
        }

        const childLinks = [];
        for (const cn of childNames) {
          const ch = findTagByName(state.tags, cn);
          if (!ch) {
            stepErr.push(`child "${cn}" does not exist.`);
          } else {
            childLinks.push(ch);
          }
        }

        if (stepErr.length) {
          stepErr.forEach((e) => errors.push(`Step ${i + 1} (create): ${e}`));
          continue;
        }

        const id = 'tag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const newTag = {
          id,
          name,
          color: raw.color && String(raw.color).trim() ? String(raw.color).trim() : '#ffeb3b',
          parentIds,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const check = canSetParents(newTag.id, parentIds, [...state.tags, newTag]);
        if (!check.ok) {
          errors.push(`Step ${i + 1} (create): ${check.reason}`);
          continue;
        }

        let childErr = null;
        for (const ch of childLinks) {
          if (!ch.parentIds) ch.parentIds = [];
          if (ch.parentIds.includes(newTag.id)) {
            warnings.push(`"${name}" is already a parent of "${ch.name}" — skipped duplicate link.`);
            continue;
          }
          const chk = canSetParents(ch.id, [...ch.parentIds, newTag.id], [...state.tags, newTag]);
          if (!chk.ok) {
            childErr = `cannot link child "${ch.name}": ${chk.reason}`;
            break;
          }
        }
        if (childErr) {
          errors.push(`Step ${i + 1} (create): ${childErr}`);
          continue;
        }

        state.tags.push(newTag);

        for (const ch of childLinks) {
          if (!ch.parentIds) ch.parentIds = [];
          if (ch.parentIds.includes(newTag.id)) continue;
          ch.parentIds.push(newTag.id);
        }

        if (childNames.length > 0) {
          lines.push(
            `Create tag "${name}" (${newTag.color}) with parents [${parentNames.join(', ') || 'none'}] and as parent of: ${childNames.join(', ')}.`
          );
        } else {
          lines.push(`Create tag "${name}" (${newTag.color}) with parents: ${parentNames.length ? parentNames.join(', ') : '(none)'}.`);
        }
        continue;
      }

      if (op === 'delete') {
        const names = Array.isArray(raw.names) ? raw.names.map((x) => String(x).trim()).filter(Boolean) : [];
        if (!names.length) {
          errors.push(`Step ${i + 1} (delete): "names" array required.`);
          continue;
        }
        for (const name of names) {
          const t = findTagByName(state.tags, name);
          if (!t) {
            warnings.push(`Cannot delete "${name}" — not found (already deleted or typo).`);
            continue;
          }
          deleteNames.push(t.name);
          const id = t.id;
          state.tags = state.tags.filter((x) => x.id !== id);
          state.tags.forEach((tag) => {
            if (tag.parentIds) tag.parentIds = tag.parentIds.filter((pid) => pid !== id);
          });
          state.highlights = state.highlights.map((h) => {
            if (h.tags) h.tags = h.tags.filter((tid) => tid !== id);
            return h;
          });
          lines.push(`Delete tag "${t.name}" (removed from highlights and parent lists).`);
        }
        continue;
      }

      if (op === 'update') {
        const name = String(raw.name || '').trim();
        if (!name) {
          errors.push(`Step ${i + 1} (update): "name" is required.`);
          continue;
        }
        const tag = findTagByName(state.tags, name);
        if (!tag) {
          errors.push(`Step ${i + 1} (update): tag "${name}" not found.`);
          continue;
        }

        if (raw.newName != null && String(raw.newName).trim()) {
          const nn = String(raw.newName).trim();
          if (nn.toLowerCase() !== tag.name.toLowerCase()) {
            if (findTagByName(state.tags, nn)) {
              errors.push(`Step ${i + 1} (update): cannot rename to "${nn}" — that name already exists.`);
              continue;
            }
            lines.push(`Rename "${tag.name}" → "${nn}".`);
            tag.name = nn;
          }
        }
        if (raw.color != null && String(raw.color).trim()) {
          tag.color = String(raw.color).trim();
          lines.push(`Update color for "${tag.name}".`);
        }

        if (raw.setParentsByName != null) {
          const pnames = Array.isArray(raw.setParentsByName) ? raw.setParentsByName.map((x) => String(x).trim()).filter(Boolean) : [];
          const newIds = [];
          const pErrs = [];
          for (const pn of pnames) {
            const p = findTagByName(state.tags, pn);
            if (!p) {
              pErrs.push(`parent "${pn}" not found`);
            } else newIds.push(p.id);
          }
          if (pErrs.length) {
            pErrs.forEach((e) => errors.push(`Step ${i + 1} (update): ${e}`));
            continue;
          }
          const chk = canSetParents(tag.id, newIds, state.tags);
          if (!chk.ok) {
            errors.push(`Step ${i + 1} (update): ${chk.reason}`);
            continue;
          }
          const same =
            tag.parentIds &&
            tag.parentIds.length === newIds.length &&
            tag.parentIds.every((id) => newIds.includes(id));
          if (same) {
            warnings.push(`Parents of "${tag.name}" are already exactly: ${pnames.join(', ') || '(none)'} — no change.`);
          } else {
            tag.parentIds = newIds;
            lines.push(`Set parents of "${tag.name}" to: ${pnames.length ? pnames.join(', ') : '(none)'}.`);
          }
        }

        const addP = Array.isArray(raw.addParentsByName) ? raw.addParentsByName.map((x) => String(x).trim()).filter(Boolean) : [];
        for (const pn of addP) {
          const p = findTagByName(state.tags, pn);
          if (!p) {
            errors.push(`Step ${i + 1} (update): parent "${pn}" not found.`);
            continue;
          }
          if (!tag.parentIds) tag.parentIds = [];
          if (tag.parentIds.includes(p.id)) {
            warnings.push(`"${p.name}" is already a parent of "${tag.name}" — skipped.`);
            continue;
          }
          const chk = canSetParents(tag.id, [...tag.parentIds, p.id], state.tags);
          if (!chk.ok) {
            errors.push(`Step ${i + 1} (update): ${chk.reason}`);
            continue;
          }
          tag.parentIds.push(p.id);
          lines.push(`Add parent "${p.name}" to "${tag.name}".`);
        }

        const remP = Array.isArray(raw.removeParentsByName) ? raw.removeParentsByName.map((x) => String(x).trim()).filter(Boolean) : [];
        for (const pn of remP) {
          const p = findTagByName(state.tags, pn);
          if (!p) {
            warnings.push(`Remove parent "${pn}" — not found, skipped.`);
            continue;
          }
          if (!tag.parentIds || !tag.parentIds.includes(p.id)) {
            warnings.push(`"${p.name}" is not a parent of "${tag.name}" — nothing to remove.`);
            continue;
          }
          tag.parentIds = tag.parentIds.filter((id) => id !== p.id);
          lines.push(`Remove parent "${p.name}" from "${tag.name}".`);
        }

        if (raw.setChildrenByName != null) {
          const cnames = Array.isArray(raw.setChildrenByName) ? raw.setChildrenByName.map((x) => String(x).trim()).filter(Boolean) : [];
          const newChildren = [];
          const cErrs = [];
          for (const cn of cnames) {
            const ch = findTagByName(state.tags, cn);
            if (!ch) cErrs.push(`child "${cn}" not found`);
            else newChildren.push(ch);
          }
          if (cErrs.length) {
            cErrs.forEach((e) => errors.push(`Step ${i + 1} (update): ${e}`));
            continue;
          }
          const newChildIds = new Set(newChildren.map((c) => c.id));
          let childLinkFailed = false;
          for (const ch of newChildren) {
            if (!ch.parentIds) ch.parentIds = [];
            if (ch.parentIds.includes(tag.id)) continue;
            const chk = canSetParents(ch.id, [...ch.parentIds, tag.id], state.tags);
            if (!chk.ok) {
              errors.push(`Step ${i + 1} (update): cannot link child "${ch.name}": ${chk.reason}`);
              childLinkFailed = true;
              break;
            }
          }
          if (childLinkFailed) continue;
          const currentChildIds = state.tags.filter((t) => t.parentIds && t.parentIds.includes(tag.id)).map((t) => t.id);
          currentChildIds.forEach((cid) => {
            if (newChildIds.has(cid)) return;
            const ch = state.tags.find((t) => t.id === cid);
            if (ch && ch.parentIds) ch.parentIds = ch.parentIds.filter((pid) => pid !== tag.id);
            lines.push(`Remove "${tag.name}" as parent from a former child.`);
          });
          newChildren.forEach((ch) => {
            if (!ch.parentIds) ch.parentIds = [];
            if (ch.parentIds.includes(tag.id)) {
              warnings.push(`"${tag.name}" is already parent of "${ch.name}" — skipped.`);
              return;
            }
            ch.parentIds.push(tag.id);
            lines.push(`Set "${tag.name}" as parent of "${ch.name}".`);
          });
        }

        const addC = Array.isArray(raw.addChildrenByName) ? raw.addChildrenByName.map((x) => String(x).trim()).filter(Boolean) : [];
        for (const cn of addC) {
          const ch = findTagByName(state.tags, cn);
          if (!ch) {
            errors.push(`Step ${i + 1} (update): child "${cn}" not found.`);
            continue;
          }
          if (!ch.parentIds) ch.parentIds = [];
          if (ch.parentIds.includes(tag.id)) {
            warnings.push(`"${tag.name}" is already parent of "${ch.name}" — skipped.`);
            continue;
          }
          const chk = canSetParents(ch.id, [...ch.parentIds, tag.id], state.tags);
          if (!chk.ok) {
            errors.push(`Step ${i + 1} (update): ${chk.reason}`);
            continue;
          }
          ch.parentIds.push(tag.id);
          lines.push(`Add "${ch.name}" as child of "${tag.name}".`);
        }

        const remC = Array.isArray(raw.removeChildrenByName) ? raw.removeChildrenByName.map((x) => String(x).trim()).filter(Boolean) : [];
        for (const cn of remC) {
          const ch = findTagByName(state.tags, cn);
          if (!ch) {
            warnings.push(`Remove child "${cn}" — not found, skipped.`);
            continue;
          }
          if (!ch.parentIds || !ch.parentIds.includes(tag.id)) {
            warnings.push(`"${tag.name}" is not a parent of "${ch.name}" — nothing to remove.`);
            continue;
          }
          ch.parentIds = ch.parentIds.filter((pid) => pid !== tag.id);
          lines.push(`Remove "${tag.name}" as parent of "${ch.name}".`);
        }

        tag.updatedAt = Date.now();
        continue;
      }

      errors.push(`Step ${i + 1}: unknown op "${raw.op}".`);
    }

    const noop =
      lines.length === 0 &&
      errors.length === 0 &&
      (warnings.length > 0 || operations.length === 0);

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      lines,
      state,
      deleteNames: [...new Set(deleteNames)],
      noop
    };
  }

  async function persistAfterApply(newTags, newHighlights) {
    await chrome.storage.local.set({ tags: newTags, highlights: newHighlights });
    if (window.authService && window.authService.getCurrentUser()) {
      if (window.authService.isSharingTags && window.authService.isSharingTags()) {
        try {
          await window.authService.syncTagsToCloud();
        } catch (e) {
          console.error(e);
        }
      }
      try {
        await window.authService.syncHighlightsToCloud();
      } catch (e) {
        console.error(e);
      }
    }
    window.dispatchEvent(new CustomEvent('mnemomarkTagsOrHighlightsChanged'));
  }

  function appendChat(role, html, isError) {
    const log = document.getElementById('tagAssistantChatLog');
    if (!log) return;
    const row = document.createElement('div');
    row.className = 'ai-chat-msg ' + (role === 'you' ? 'ai-chat-user' : 'ai-chat-assistant');
    if (isError) row.classList.add('ai-chat-error');
    row.innerHTML = `<div class="ai-chat-role">${escapeHtml(role)}</div><div class="ai-chat-bubble">${html}</div>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function clearConfirmPanel() {
    pendingValidated = null;
    const panel = document.getElementById('tagAssistantConfirmPanel');
    if (panel) panel.style.display = 'none';
    const list = document.getElementById('tagAssistantConfirmList');
    if (list) list.innerHTML = '';
  }

  function showConfirmPanel(result, intro) {
    const panel = document.getElementById('tagAssistantConfirmPanel');
    const list = document.getElementById('tagAssistantConfirmList');
    if (!panel || !list) return;

    let html = '';
    if (intro) {
      html += `<p class="ai-confirm-intro">${escapeHtml(intro)}</p>`;
    }
    if (result.lines && result.lines.length) {
      html += '<ul>';
      result.lines.forEach((ln) => {
        html += `<li>${escapeHtml(ln)}</li>`;
      });
      html += '</ul>';
    }
    if (result.warnings && result.warnings.length) {
      html += '<div class="ai-warnings"><strong>Notes</strong><ul>';
      result.warnings.forEach((w) => {
        html += `<li>${escapeHtml(w)}</li>`;
      });
      html += '</ul></div>';
    }
    list.innerHTML = html;
    panel.style.display = 'block';
    pendingValidated = result;
  }

  async function onSend() {
    const input = document.getElementById('tagAssistantInput');
    const sendBtn = document.getElementById('tagAssistantSend');
    const text = (input && input.value.trim()) || '';
    if (!text) return;

    clearConfirmPanel();

    appendChat('you', escapeHtml(text));
    if (input) input.value = '';

    if (sendBtn) sendBtn.disabled = true;

    try {
      const storage = await chrome.storage.local.get(['tags', 'highlights']);
      const tags = storage.tags || [];

      const { operations, parseErrors } = parseCommands(text, tags);
      if (parseErrors.length) {
        appendChat(
          'assistant',
          '<p><strong>Could not parse:</strong></p><ul>' + parseErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>',
          true
        );
        return;
      }

      const sim = simulateOperations(tags, storage.highlights || [], operations);

      if (!sim.ok) {
        const errHtml =
          '<p><strong>These changes cannot be applied:</strong></p><ul>' +
          sim.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('') +
          '</ul>';
        appendChat('assistant', errHtml + (sim.warnings.length ? '<p>Notes:</p><ul>' + sim.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>' : ''), true);
        return;
      }

      if (sim.noop && sim.lines.length === 0) {
        const wHtml =
          sim.warnings.length > 0
            ? '<ul>' + sim.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>'
            : '<p>No effective changes.</p>';
        appendChat('assistant', wHtml, false);
        return;
      }

      const initials = cloneState(tags, storage.highlights || []);
      const same =
        JSON.stringify(initials.tags) === JSON.stringify(sim.state.tags) &&
        JSON.stringify(initials.highlights) === JSON.stringify(sim.state.highlights);
      if (same) {
        appendChat(
          'assistant',
          sim.warnings.length
            ? '<ul>' + sim.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>'
            : escapeHtml('No changes to apply.'),
          false
        );
        return;
      }

      showConfirmPanel(sim, 'Review the steps below, then confirm to save.');
    } catch (err) {
      appendChat('assistant', escapeHtml(err.message || String(err)), true);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function onConfirmApply() {
    if (!pendingValidated || !pendingValidated.ok) return;
    const sim = pendingValidated;
    const hasDelete = sim.deleteNames && sim.deleteNames.length > 0;

    if (hasDelete) {
      const ok = confirm(
        `Delete tag(s): ${sim.deleteNames.join(', ')}?\n\nThis will remove them from all highlights.`
      );
      if (!ok) return;
    } else {
      const ok = confirm('Apply these tag changes to your library?');
      if (!ok) return;
    }

    await persistAfterApply(sim.state.tags, sim.state.highlights);
    clearConfirmPanel();
    appendChat('assistant', escapeHtml('Changes saved.'), false);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('tagAssistantSend');
    const input = document.getElementById('tagAssistantInput');
    const confirmBtn = document.getElementById('tagAssistantConfirmApplyBtn');
    const cancelBtn = document.getElementById('tagAssistantConfirmCancelBtn');

    if (sendBtn) sendBtn.addEventListener('click', () => onSend());
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSend();
        }
      });
    }

    if (confirmBtn) confirmBtn.addEventListener('click', () => onConfirmApply());
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        clearConfirmPanel();
        appendChat('assistant', escapeHtml('Cancelled — nothing was changed.'), false);
      });
    }
  });
})();
