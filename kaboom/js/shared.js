/* Kaboom: helpers shared by the player, host and editor pages. */
(function () {
  'use strict';

  const KB = (window.KB = {});

  // Every Kaboom game registers on the public PeerJS relay as PREFIX + PIN.
  KB.PREFIX = 'kaboom-lw22-';
  KB.NAME_MAX = 15;
  KB.TIMERS = [10, 20, 30, 60, 90];
  KB.QUESTION_MAX = 200;
  KB.ANSWER_MAX = 80;
  KB.AVATARS = [
    '🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐵', '🐧',
    '🦖', '🐝', '🐨', '🦁', '🐷', '🐰', '🦉', '🐢',
    '🐳', '🦩', '👾', '🤖', '👻', '🎃', '🌵', '🍕',
  ];

  KB.params = new URLSearchParams(location.search);

  // `?peer=host:port` points the page at a self-hosted PeerServer (used for local testing).
  KB.peerOptions = function () {
    const p = KB.params.get('peer');
    if (p) {
      const [host, port] = p.split(':');
      return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 1, config: { iceServers: [] } };
    }
    return { debug: 1 };
  };
  KB.peerQuery = () => (KB.params.get('peer') ? '&peer=' + encodeURIComponent(KB.params.get('peer')) : '');

  KB.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  KB.uid = (prefix) => (prefix || '') + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  KB.cleanName = (n) =>
    String(n || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, KB.NAME_MAX);

  KB.ordinal = function (n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  KB.num = (n) => Math.round(n).toLocaleString('en-US');

  KB.medal = (rank) => ['🥇', '🥈', '🥉'][rank - 1] || '';

  // ---------- storage ----------
  function makeStore(area) {
    return {
      get(key, fallback) {
        try {
          const v = window[area].getItem(key);
          return v == null ? fallback : JSON.parse(v);
        } catch (e) {
          return fallback;
        }
      },
      set(key, value) {
        try {
          window[area].setItem(key, JSON.stringify(value));
          return null;
        } catch (e) {
          return e;
        }
      },
      remove(key) {
        try {
          window[area].removeItem(key);
        } catch (e) {
          /* storage unavailable */
        }
      },
    };
  }
  KB.store = makeStore('localStorage');
  KB.session = makeStore('sessionStorage');

  // ---------- quizzes ----------
  // Stored in localStorage under "kaboom.quizzes":
  // [{ id, title, updated, questions: [{ id, type: "quiz"|"tf", text, image, answers: [4 strings], correct: [indexes] }] }]
  KB.QUIZ_KEY = 'kaboom.quizzes';

  KB.blankQuestion = (type) => ({
    id: KB.uid('q-'),
    type: type === 'tf' ? 'tf' : 'quiz',
    text: '',
    image: '',
    answers: ['', '', '', ''],
    correct: [],
  });

  KB.normalizeQuestion = function (q) {
    q = q && typeof q === 'object' ? q : {};
    const answers = Array.isArray(q.answers) ? q.answers.slice(0, 4).map((a) => String(a == null ? '' : a)) : [];
    while (answers.length < 4) answers.push('');
    const type = q.type === 'tf' ? 'tf' : 'quiz';
    const max = type === 'tf' ? 2 : 4;
    let correct = Array.isArray(q.correct) ? q.correct.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < max) : [];
    correct = [...new Set(correct)].sort();
    if (type === 'tf') correct = correct.slice(0, 1);
    return {
      id: typeof q.id === 'string' && q.id ? q.id : KB.uid('q-'),
      type,
      text: String(q.text || '').slice(0, KB.QUESTION_MAX),
      image: typeof q.image === 'string' ? q.image : '',
      answers: answers.map((a) => a.slice(0, KB.ANSWER_MAX)),
      correct,
    };
  };

  KB.normalizeQuiz = function (z) {
    z = z && typeof z === 'object' ? z : {};
    return {
      id: typeof z.id === 'string' && z.id ? z.id : KB.uid('z-'),
      title: String(z.title || 'Untitled quiz').slice(0, 80),
      updated: z.updated || new Date().toISOString(),
      questions: Array.isArray(z.questions) ? z.questions.map(KB.normalizeQuestion) : [],
    };
  };

  KB.loadQuizzes = function () {
    let list = KB.store.get(KB.QUIZ_KEY, null);
    if (!Array.isArray(list)) {
      list = [KB.sampleQuiz()];
      KB.saveQuizzes(list);
    }
    return list.map(KB.normalizeQuiz);
  };

  // Returns null on success, or the storage error (usually "quota exceeded").
  KB.saveQuizzes = (list) => KB.store.set(KB.QUIZ_KEY, list);

  // What's wrong with a question, or '' if it's ready to play.
  KB.questionProblem = function (q) {
    if (!q.text.trim()) return 'Add the question text';
    if (q.type === 'tf') return q.correct.length ? '' : 'Pick True or False as the answer';
    const filled = q.answers.filter((a) => a.trim()).length;
    if (filled < 2) return 'Add at least 2 answers';
    if (!q.correct.some((i) => q.answers[i] && q.answers[i].trim())) return 'Mark the correct answer';
    return '';
  };

  // The version the host plays: blank answers dropped, so options are always numbered 1..n.
  KB.playable = function (q) {
    const answers =
      q.type === 'tf'
        ? [
            { text: 'True', correct: q.correct.includes(0) },
            { text: 'False', correct: q.correct.includes(1) },
          ]
        : q.answers
            .map((text, i) => ({ text: text.trim(), correct: q.correct.includes(i) }))
            .filter((a) => a.text);
    return { id: q.id, type: q.type, text: q.text.trim(), image: q.image, answers };
  };

  KB.sampleQuiz = () =>
    KB.normalizeQuiz({
      id: 'z-sample',
      title: 'Kaboom warm-up',
      questions: [
        { type: 'quiz', text: 'Which planet is known as the Red Planet?', answers: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: [1] },
        { type: 'tf', text: 'An octopus has three hearts.', correct: [0] },
        {
          type: 'quiz',
          text: 'Which of these is a primary color of light? (More than one is right!)',
          answers: ['Red', 'Yellow', 'Green', 'Blue'],
          correct: [0, 2, 3],
        },
        { type: 'quiz', text: 'What is the largest ocean on Earth?', answers: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: [3] },
        { type: 'tf', text: 'Lightning never strikes the same place twice.', correct: [1] },
        { type: 'quiz', text: 'How many minutes are in a day?', answers: ['1,240', '1,440', '2,400', '1,600'], correct: [1] },
        { type: 'quiz', text: 'Which is the fastest land animal?', answers: ['Lion', 'Greyhound', 'Cheetah', 'Pronghorn'], correct: [2] },
      ],
    });

  // ---------- keep the screen awake (phones, projector laptops) ----------
  let wakeLock = null;
  let wantAwake = false;
  KB.keepAwake = async function () {
    wantAwake = true;
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch (e) {
      /* not supported or not allowed */
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (wantAwake && document.visibilityState === 'visible') KB.keepAwake();
  });

  KB.download = function (filename, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  };
})();
