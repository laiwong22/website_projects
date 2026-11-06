/* Kaboom quiz editor. Quizzes autosave to this browser's localStorage. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = KB.esc;
  const editor = $('#editor');

  let quizzes = KB.loadQuizzes();
  let currentId = decodeURIComponent(location.hash.slice(1)) || KB.params.get('quiz') || '';
  if (!quizzes.some((z) => z.id === currentId)) currentId = quizzes[0] ? quizzes[0].id : '';
  let saveTimer = null;
  let imageTarget = null;

  const current = () => quizzes.find((z) => z.id === currentId);
  const findQ = (qid) => (current() ? current().questions.find((q) => q.id === qid) : null);

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), Math.max(3200, msg.length * 70));
  }

  function setState(text, bad) {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const err = KB.saveQuizzes(quizzes);
    if (err) setState('Not saved: this browser is out of space. Use smaller images or image links.', true);
    else setState('Saved ✓');
    renderList();
  }

  // Typing saves a moment later; leaving the page (or clicking Host) saves anything still pending.
  function save() {
    clearTimeout(saveTimer);
    setState('Saving…');
    saveTimer = setTimeout(saveNow, 350);
  }
  const flushSave = () => saveTimer && saveNow();
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());

  function touch() {
    const z = current();
    if (z) z.updated = new Date().toISOString();
    save();
  }

  // ---------- rendering ----------
  function renderList() {
    $('#quiz-list').innerHTML =
      quizzes
        .map((z) => {
          const n = z.questions.length;
          return (
            '<button class="quiz-item" type="button" data-open="' + esc(z.id) + '" aria-current="' + (z.id === currentId) + '">' +
            '<b>' + esc(z.title || 'Untitled quiz') + '</b><span>' + n + ' question' + (n === 1 ? '' : 's') + '</span></button>'
          );
        })
        .join('') || '<p class="hint">No quizzes yet.</p>';
    $('#host-link').href = 'host.html' + (currentId ? '?quiz=' + encodeURIComponent(currentId) : '');
  }

  function questionHtml(q, i) {
    const problem = KB.questionProblem(q);
    const tf = q.type === 'tf';
    let answers = '';
    for (let a = 0; a < (tf ? 2 : 4); a++) {
      const val = tf ? (a === 0 ? 'True' : 'False') : q.answers[a];
      answers +=
        '<div class="e-ans c' + (a + 1) + '"><span class="n">' + (a + 1) + '</span>' +
        '<input class="field" data-f="answer" data-i="' + a + '" value="' + esc(val) + '" maxlength="' + KB.ANSWER_MAX + '" placeholder="Answer ' + (a + 1) +
        (a >= 2 ? ' (optional)' : '') + '" aria-label="Answer ' + (a + 1) + '"' + (tf ? ' readonly tabindex="-1"' : '') + '>' +
        '<button type="button" class="mark-btn" data-act="correct" data-i="' + a + '" aria-pressed="' + q.correct.includes(a) + '" title="Mark as a right answer" aria-label="Answer ' + (a + 1) + ' is right">✓</button></div>';
    }
    const image = q.image
      ? '<img src="' + esc(q.image) + '" alt="Question image"><button class="btn ghost small" type="button" data-act="img-remove">Remove image</button>'
      : '<button class="btn ghost small" type="button" data-act="img-upload">🖼 Add image</button>' +
        '<input class="field url" data-f="imageUrl" type="url" placeholder="…or paste an image link (https://…)" aria-label="Image link">';
    return (
      '<article class="qcard' + (problem ? ' has-problem' : '') + '" data-qid="' + esc(q.id) + '">' +
      '<header><span class="qnum">' + (i + 1) + '</span>' +
      '<select data-f="type" aria-label="Question type"><option value="quiz"' + (tf ? '' : ' selected') + '>Multiple choice</option>' +
      '<option value="tf"' + (tf ? ' selected' : '') + '>True or false</option></select>' +
      '<span class="qwarn">' + esc(problem) + '</span>' +
      '<div class="qtools">' +
      '<button class="icon-btn" type="button" data-act="up" title="Move up" aria-label="Move up">↑</button>' +
      '<button class="icon-btn" type="button" data-act="down" title="Move down" aria-label="Move down">↓</button>' +
      '<button class="icon-btn" type="button" data-act="dup" title="Duplicate" aria-label="Duplicate">⧉</button>' +
      '<button class="icon-btn" type="button" data-act="del" title="Delete" aria-label="Delete">🗑</button>' +
      '</div></header>' +
      '<textarea class="field" data-f="text" rows="2" maxlength="' + KB.QUESTION_MAX + '" placeholder="Type your question…" aria-label="Question">' + esc(q.text) + '</textarea>' +
      '<div class="qimage">' + image + '</div>' +
      '<div class="e-answers">' + answers + '</div>' +
      '<p class="hint">' +
      (tf ? 'Tap ✓ on the right answer.' : 'Fill in 2 to 4 answers and tap ✓ on every right one (more than one is OK).') +
      ' Images show on the big screen only.</p>' +
      '</article>'
    );
  }

  function renderEditor() {
    const z = current();
    if (!z) {
      editor.innerHTML =
        '<div class="e-empty"><h2 class="display" style="font-size:32px;margin:0 0 8px">Make your first quiz</h2>' +
        '<p class="muted">Add questions with 2 to 4 answers, true-or-false questions, several right answers and pictures.</p>' +
        '<p><button class="btn" type="button" data-act="new">+ New quiz</button></p></div>';
      return;
    }
    editor.innerHTML =
      '<div class="e-head"><input class="field title-input" data-f="title" value="' + esc(z.title) + '" maxlength="80" placeholder="Quiz title" aria-label="Quiz title">' +
      '<span class="save-state" id="save-state" aria-live="polite"></span></div>' +
      '<div class="e-head">' +
      '<a class="btn" href="host.html?quiz=' + encodeURIComponent(z.id) + '">▶ Host this quiz</a>' +
      '<button class="btn ghost small" type="button" data-act="export">Export</button>' +
      '<button class="btn ghost small" type="button" data-act="duplicate-quiz">Duplicate</button>' +
      '<button class="btn ghost small" type="button" data-act="delete-quiz">Delete quiz</button>' +
      '</div>' +
      '<div id="questions" style="display:flex;flex-direction:column;gap:14px">' + z.questions.map(questionHtml).join('') + '</div>' +
      '<div class="add-row">' +
      '<button class="btn" type="button" data-act="add" data-type="quiz">+ Multiple choice</button>' +
      '<button class="btn ghost" type="button" data-act="add" data-type="tf">+ True or false</button>' +
      '</div>';
  }

  function renderAll() {
    renderList();
    renderEditor();
  }

  function rerenderCard(q) {
    const z = current();
    const card = editor.querySelector('[data-qid="' + CSS.escape(q.id) + '"]');
    if (!z || !card) return renderEditor();
    card.outerHTML = questionHtml(q, z.questions.indexOf(q));
  }

  function updateProblem(card, q) {
    const p = KB.questionProblem(q);
    card.classList.toggle('has-problem', !!p);
    card.querySelector('.qwarn').textContent = p;
  }

  // ---------- images ----------
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 960 / img.width, 720 / img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('not an image'));
      };
      img.src = url;
    });
  }

  $('#image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const q = findQ(imageTarget);
    if (!file || !q) return;
    try {
      q.image = await resizeImage(file);
      rerenderCard(q);
      touch();
    } catch (err) {
      toast("That file doesn't look like an image.");
    }
  });

  // ---------- import / export ----------
  const slug = (s) => (s || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz';

  function exportQuizzes(list, name) {
    KB.download(name + '.kaboom.json', JSON.stringify({ kaboom: 1, quizzes: list }, null, 2));
  }

  // Read a quiz file, forgiving the usual hand-editing slips: curly quotes from phones or Word,
  // and a comma after the last item in a list.
  function parseQuizFile(text) {
    text = String(text).replace(/^﻿/, '');
    try {
      return JSON.parse(text);
    } catch (err) {
      const fixed = text.replace(/[“”„‟]/g, '"').replace(/,(\s*[\]}])/g, '$1');
      try {
        return JSON.parse(fixed);
      } catch (e2) {
        const m = /line (\d+)/.exec(err.message) || /position (\d+)/.exec(err.message);
        let line = 0;
        if (m) line = /line/.test(m[0]) ? Number(m[1]) : text.slice(0, Number(m[1])).split('\n').length;
        throw new Error(line ? 'near line ' + line : '');
      }
    }
  }

  $('#import-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    let added = 0;
    let unfinished = 0;
    const problems = [];
    for (const f of files) {
      let data;
      try {
        data = parseQuizFile(await f.text());
      } catch (err) {
        problems.push('“' + f.name + '” has a typo' + (err.message ? ' ' + err.message : '') + ' (usually a missing comma, quote or bracket).');
        continue;
      }
      const arr = Array.isArray(data) ? data : data && Array.isArray(data.quizzes) ? data.quizzes : [data];
      let found = 0;
      for (const raw of arr) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.questions)) continue;
        const z = KB.normalizeQuiz(raw);
        if (quizzes.some((o) => o.id === z.id)) z.id = KB.uid('z-');
        z.questions.forEach((q) => (q.id = KB.uid('q-'))); // ids in hand-made files are often copy-pasted
        unfinished += z.questions.filter((q) => KB.questionProblem(q)).length;
        quizzes.unshift(z);
        currentId = z.id;
        added++;
        found++;
      }
      if (!found) problems.push('“' + f.name + '” has no quizzes in it (each quiz needs a "questions" list).');
    }
    if (added) {
      history.replaceState(null, '', '#' + encodeURIComponent(currentId));
      renderAll();
      saveNow();
    }
    const msg = [];
    if (added) {
      msg.push(
        'Imported ' + added + (added === 1 ? ' quiz.' : ' quizzes.') +
          (unfinished ? ' ' + unfinished + (unfinished === 1 ? ' question needs' : ' questions need') + ' fixing (marked in red).' : '')
      );
    }
    toast(msg.concat(problems).join(' ') || "Couldn't find any Kaboom quizzes in that file.");
  });

  // ---------- editing ----------
  editor.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    const z = current();
    if (!f || !z) return;
    if (f === 'title') {
      z.title = e.target.value;
      return touch();
    }
    const card = e.target.closest('.qcard');
    const q = card && findQ(card.dataset.qid);
    if (!q) return;
    if (f === 'text') q.text = e.target.value;
    else if (f === 'answer' && q.type === 'quiz') q.answers[Number(e.target.dataset.i)] = e.target.value;
    else return;
    updateProblem(card, q);
    touch();
  });

  editor.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    const card = e.target.closest('.qcard');
    const q = card && findQ(card.dataset.qid);
    if (!q) return;
    if (f === 'type') {
      q.type = e.target.value === 'tf' ? 'tf' : 'quiz';
      q.correct = [];
      rerenderCard(q);
      touch();
    } else if (f === 'imageUrl') {
      const v = e.target.value.trim();
      if (!v) return;
      if (!/^https?:\/\//i.test(v)) return toast('Paste a link that starts with https://');
      q.image = v;
      rerenderCard(q);
      touch();
    }
  });

  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      currentId = open.dataset.open;
      history.replaceState(null, '', '#' + encodeURIComponent(currentId));
      renderAll();
      window.scrollTo({ top: 0 });
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const z = current();
    const card = btn.closest('.qcard');
    const q = card && findQ(card.dataset.qid);

    switch (act) {
      case 'new': {
        const nz = KB.normalizeQuiz({ title: 'New quiz', questions: [KB.blankQuestion('quiz')] });
        quizzes.unshift(nz);
        currentId = nz.id;
        history.replaceState(null, '', '#' + encodeURIComponent(currentId));
        renderAll();
        save();
        const t = editor.querySelector('[data-f="title"]');
        t.focus();
        t.select();
        break;
      }
      case 'import':
        $('#import-file').click();
        break;
      case 'export-all':
        if (!quizzes.length) return toast('No quizzes to export yet.');
        exportQuizzes(quizzes, 'kaboom-quizzes');
        break;
      case 'export':
        if (z) exportQuizzes([z], slug(z.title));
        break;
      case 'duplicate-quiz': {
        if (!z) return;
        const copy = KB.normalizeQuiz(JSON.parse(JSON.stringify(z)));
        copy.id = KB.uid('z-');
        copy.title = (z.title + ' (copy)').slice(0, 80);
        copy.questions.forEach((x) => (x.id = KB.uid('q-')));
        quizzes.splice(quizzes.indexOf(z) + 1, 0, copy);
        currentId = copy.id;
        history.replaceState(null, '', '#' + encodeURIComponent(currentId));
        renderAll();
        save();
        toast('Made a copy.');
        break;
      }
      case 'delete-quiz':
        if (!z || !confirm('Delete “' + z.title + '”? This can’t be undone (export it first if you might want it back).')) return;
        quizzes = quizzes.filter((x) => x !== z);
        currentId = quizzes[0] ? quizzes[0].id : '';
        history.replaceState(null, '', currentId ? '#' + encodeURIComponent(currentId) : location.pathname);
        renderAll();
        save();
        break;
      case 'add': {
        if (!z) return;
        const nq = KB.blankQuestion(btn.dataset.type);
        z.questions.push(nq);
        renderEditor();
        touch();
        const el = editor.querySelector('[data-qid="' + CSS.escape(nq.id) + '"] textarea');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
        break;
      }
      case 'correct': {
        if (!q) return;
        const i = Number(btn.dataset.i);
        if (q.type === 'tf') q.correct = [i];
        else q.correct = q.correct.includes(i) ? q.correct.filter((x) => x !== i) : q.correct.concat(i).sort();
        card.querySelectorAll('[data-act="correct"]').forEach((b) => b.setAttribute('aria-pressed', String(q.correct.includes(Number(b.dataset.i)))));
        updateProblem(card, q);
        touch();
        break;
      }
      case 'up':
      case 'down': {
        if (!q) return;
        const list = z.questions;
        const i = list.indexOf(q);
        const j = act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        renderEditor();
        touch();
        const moved = editor.querySelector('[data-qid="' + CSS.escape(q.id) + '"]');
        moved.scrollIntoView({ block: 'nearest' });
        moved.querySelector('[data-act="' + act + '"]').focus({ preventScroll: true });
        break;
      }
      case 'dup': {
        if (!q) return;
        const copy = KB.normalizeQuestion(JSON.parse(JSON.stringify(q)));
        copy.id = KB.uid('q-');
        z.questions.splice(z.questions.indexOf(q) + 1, 0, copy);
        renderEditor();
        touch();
        break;
      }
      case 'del':
        if (!q) return;
        if ((q.text.trim() || q.image) && !confirm('Delete question ' + (z.questions.indexOf(q) + 1) + '?')) return;
        z.questions = z.questions.filter((x) => x !== q);
        renderEditor();
        touch();
        break;
      case 'img-upload':
        if (!q) return;
        imageTarget = q.id;
        $('#image-file').click();
        break;
      case 'img-remove':
        if (!q) return;
        q.image = '';
        rerenderCard(q);
        touch();
        break;
    }
  });

  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== currentId && quizzes.some((z) => z.id === id)) {
      currentId = id;
      renderAll();
    }
  });

  renderAll();
  // Opened from a quiz link: add the quiz and show it.
  KB.importFromLink().then((res) => {
    if (!res) return;
    if (res.error) return toast(res.error);
    quizzes = KB.loadQuizzes();
    currentId = res.quizzes[0].id;
    history.replaceState(null, '', '#' + encodeURIComponent(currentId));
    renderAll();
    toast('Added \u201c' + res.quizzes[0].title + '\u201d from the link.');
  });
})();
