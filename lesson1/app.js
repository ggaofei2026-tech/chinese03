(() => {
  const L = () => window.LESSON;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const player = $('#player');

  let activeSent = 0;
  let queue = [];
  let mode = null; // 'word' | 'sentence' | null
  let karaokeOn = false;
  let lastWordIdx = -1;
  let queueTotal = 0;
  let playAttempt = 0;
  const show = {
    words: { py: true, ja: true },
    sents: { py: true, ja: true }
  };

  function setStatus(msg, state = mode ? 'playing' : 'idle') {
    const hidden = $('#status-text');
    const visible = $('#playback-status-text');
    const region = $('#playback-status');
    if (hidden) hidden.textContent = msg;
    if (visible) visible.textContent = msg;
    if (region) region.dataset.state = state;
  }

  function currentSpeed() {
    if (mode === 'word') return Number($('#speed-words').value);
    return Number($('#speed-sents').value);
  }

  function scrollBehavior() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  function setPlaybackActive(active) {
    document.body.classList.toggle('is-playing', active);
    $$('[data-stop-playback]').forEach((btn) => {
      btn.disabled = !active;
    });
  }

  function setNowWordMessage(message) {
    const el = $('#now-word');
    if (el) el.textContent = message;
  }

  function stopAll(msg = '再生を停止しました。', state = 'idle') {
    const previousMode = mode;
    queue = [];
    queueTotal = 0;
    karaokeOn = false;
    lastWordIdx = -1;
    playAttempt += 1;
    player.pause();
    player.removeAttribute('src');
    try { player.load(); } catch (_) { /* ignore */ }
    $$('.word-card.is-playing').forEach((el) => el.classList.remove('is-playing'));
    clearKaraokeClasses();
    mode = null;
    setPlaybackActive(false);
    if (previousMode === 'sentence') {
      setNowWordMessage('再生を停止しました。「聴く」で最初から再生できます。');
    }
    setStatus(msg, state);
  }

  function clearKaraokeClasses() {
    $$('#sent-zh .word').forEach((el) => el.classList.remove('is-current', 'is-spoken'));
  }

  function playQueue(items, label, nextMode) {
    if (!items.length) {
      setStatus('再生する内容がありません。', 'error');
      return;
    }
    playAttempt += 1;
    player.pause();
    mode = nextMode;
    queue = [...items];
    queueTotal = items.length;
    setPlaybackActive(true);
    setStatus(label, 'playing');
    playNext();
  }

  function playNext() {
    if (!mode && !queue.length) return;
    const item = queue.shift();
    if (!item) {
      const completedMode = mode;
      queueTotal = 0;
      karaokeOn = false;
      lastWordIdx = -1;
      playAttempt += 1;
      clearKaraokeClasses();
      $$('.word-card.is-playing').forEach((el) => el.classList.remove('is-playing'));
      mode = null;
      setPlaybackActive(false);
      if (completedMode === 'sentence') {
        setNowWordMessage('本文の再生が終わりました。声に出してもう一度練習してみましょう。');
      }
      setStatus('再生が終わりました。もう一度でも、自分で言ってみてもOKです。', 'done');
      return;
    }

    const position = queueTotal - queue.length;
    const kindLabel = item.kind === 'word' ? '単語' : '本文';
    const progress = queueTotal > 1 ? ` ${position}/${queueTotal}` : '';
    const detail = item.label ? `：${item.label}` : '';

    if (item.kind === 'word') {
      karaokeOn = false;
      clearKaraokeClasses();
      $$('.word-card').forEach((el) => {
        el.classList.toggle('is-playing', Number(el.dataset.id) === item.id);
      });
      const card = $(`.word-card[data-id="${item.id}"]`);
      card?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    }

    if (item.kind === 'sentence') {
      $$('.word-card.is-playing').forEach((el) => el.classList.remove('is-playing'));
      activeSent = L().sentences.findIndex((s) => s.id === item.id);
      if (activeSent < 0) activeSent = 0;
      renderSentenceStage();
      startKaraoke();
      $('#sent-stage')?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    }

    setStatus(`${kindLabel}${progress}${detail} を再生中…`, 'playing');
    const attempt = ++playAttempt;
    player.src = item.audio;
    player.playbackRate = currentSpeed();
    const p = player.play();
    if (p?.catch) {
      p.catch((error) => {
        if (attempt !== playAttempt || error?.name === 'AbortError') return;
        stopAll('再生できませんでした。音声ファイルを確認して、もう一度お試しください。', 'error');
      });
    }
  }
  /* —— Words —— */
  function renderWords() {
    const grid = $('#word-grid');
    grid.innerHTML = L().words.map((w) => {
      const pyOff = show.words.py ? '' : ' py-off';
      const jaOff = show.words.ja ? '' : ' ja-off';
      return `<button type="button" class="word-card${pyOff}${jaOff}" data-id="${w.id}" aria-label="${w.zh} ${w.py} ${w.ja} を再生">
        <span class="no">${String(w.id).padStart(2, '0')}</span>
        <span class="zh" lang="zh-CN">${w.zh}</span>
        <span class="py">${w.pyList ? w.pyList.join(' ') : w.py}</span>
        <span class="ja">${w.ja}</span>
        <span class="play-hint">▶ タップして聴く</span>
      </button>`;
    }).join('');
  }

  /* —— Sentences —— */
  function isHan(ch) {
    return /[\u3400-\u9fff]/.test(ch);
  }

  function wordEntry(word) {
    return L().words.find((w) => w.zh === word) || null;
  }

  function wordPy(word) {
    const found = wordEntry(word);
    if (found?.py) return found.py;
    if (window.pinyinPro?.pinyin) return window.pinyinPro.pinyin(word, { toneType: 'symbol' });
    return '—';
  }

  function charPinyinList(word) {
    const chars = [...word].filter(isHan);
    const found = wordEntry(word);
    if (found?.pyList && found.pyList.length === chars.length) {
      return found.pyList.slice();
    }
    if (window.pinyinPro?.pinyin) {
      const arr = window.pinyinPro.pinyin(word, {
        toneType: 'symbol',
        type: 'array',
        nonZh: 'removed'
      });
      if (Array.isArray(arr) && arr.length === chars.length) return arr;
      return chars.map((ch) => window.pinyinPro.pinyin(ch, { toneType: 'symbol' }) || '—');
    }
    return chars.map(() => '—');
  }

  function wordRubyHtml(word) {
    const pys = charPinyinList(word);
    let i = 0;
    return [...word].map((ch) => {
      if (!isHan(ch)) return ch;
      const py = pys[i++] || '—';
      return `<ruby>${ch}<rt>${py}</rt></ruby>`;
    }).join('');
  }

  function buildSentenceHtml(sent) {
    const tokens = [];
    let pos = 0;
    let wi = 0;
    const text = sent.zh;
    const words = sent.words;

    while (pos < text.length) {
      const ch = text[pos];
      if (!isHan(ch)) {
        tokens.push(`<span class="punct">${ch}</span>`);
        pos += 1;
        continue;
      }
      if (wi < words.length && text.startsWith(words[wi], pos)) {
        const w = words[wi];
        const py = wordPy(w);
        const weight = Math.max(1, [...w].filter(isHan).length);
        const ruby = wordRubyHtml(w);
        tokens.push(
          `<button type="button" class="word" data-wi="${wi}" data-word="${w}" data-pinyin="${py}" data-weight="${weight}" aria-label="${w} ${py}">${ruby}</button>`
        );
        pos += w.length;
        wi += 1;
        continue;
      }
      const py = charPinyinList(ch)[0] || '—';
      tokens.push(
        `<button type="button" class="word" data-wi="${wi}" data-word="${ch}" data-pinyin="${py}" data-weight="1" aria-label="${ch} ${py}"><ruby>${ch}<rt>${py}</rt></ruby></button>`
      );
      pos += 1;
      wi += 1;
    }
    return tokens.join('');
  }

  function renderSentList() {
    $('#sent-list').innerHTML = L().sentences.map((s, i) =>
      `<button type="button" data-index="${i}" aria-current="${i === activeSent ? 'true' : 'false'}" class="${i === activeSent ? 'is-active' : ''}">
        <b>${String(s.id).padStart(2, '0')}</b>${s.zh}
      </button>`
    ).join('');
  }

  function renderSentenceStage() {
    const s = L().sentences[activeSent];
    const stage = $('#sent-stage');
    stage.classList.toggle('py-off', !show.sents.py);
    stage.classList.toggle('ja-off', !show.sents.ja);
    $('#sent-no').textContent = String(s.id).padStart(2, '0');
    const sentPy = $('#sent-py');
    if (sentPy) {
      sentPy.hidden = true;
      sentPy.textContent = '';
    }
    $('#sent-zh').innerHTML = buildSentenceHtml(s);
    $('#sent-zh').classList.toggle('pinyin-hidden', !show.sents.py);
    $('#sent-ja').textContent = s.ja;
    if (!karaokeOn) {
      $('#now-word').textContent = '再生すると、いまの単語がここに出ます。';
      clearKaraokeClasses();
    }
    renderSentList();
  }

  function startKaraoke() {
    karaokeOn = true;
    lastWordIdx = -1;
    clearKaraokeClasses();
    $('#now-word').textContent = '再生中… オレンジの単語を追いましょう。';
  }

  function wordIndexFromProgress(progress, nodes) {
    const weights = nodes.map((n) => Number(n.dataset.weight) || 1);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const target = Math.min(1, Math.max(0, progress)) * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (target < acc) return i;
    }
    return weights.length - 1;
  }

  function updateKaraoke() {
    if (!karaokeOn || mode !== 'sentence') return;
    const nodes = $$('#sent-zh .word[data-wi]');
    if (!nodes.length) return;
    const duration = player.duration;
    if (!duration || !Number.isFinite(duration)) return;

    const lead = Math.min(0.1, duration * 0.05);
    const tail = Math.min(0.18, duration * 0.07);
    const usable = Math.max(0.01, duration - lead - tail);
    const t = Math.min(Math.max(player.currentTime - lead, 0), usable);
    const idx = wordIndexFromProgress(t / usable, nodes);
    if (idx === lastWordIdx) return;
    lastWordIdx = idx;

    nodes.forEach((el, i) => {
      el.classList.toggle('is-spoken', i < idx);
      el.classList.toggle('is-current', i === idx);
    });

    const cur = nodes[idx];
    if (cur) {
      $('#now-word').innerHTML = `<span class="label">いまの単語</span><span class="zh" lang="zh-CN">${cur.dataset.word}</span><span class="py">${cur.dataset.pinyin}</span>`;
    }
  }

  /* —— Events —— */
  function bind() {
    $('#word-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.word-card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const w = L().words.find((x) => x.id === id);
      if (!w) return;
      playQueue([{ kind: 'word', id: w.id, audio: w.audio, label: w.zh }], `単語：${w.zh}`, 'word');
    });

    $('#btn-play-all-words').addEventListener('click', () => {
      const items = L().words.map((w) => ({ kind: 'word', id: w.id, audio: w.audio, label: w.zh }));
      playQueue(items, '単語を順番に再生中…', 'word');
    });

    $('#sent-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-index]');
      if (!btn) return;
      if (mode) stopAll('文を切り替えたため、再生を停止しました。');
      activeSent = Number(btn.dataset.index);
      renderSentenceStage();
    });

    $('#btn-sent-play').addEventListener('click', () => {
      const s = L().sentences[activeSent];
      playQueue([{ kind: 'sentence', id: s.id, audio: s.audio, label: s.zh }], `本文 ${s.id} を再生中`, 'sentence');
    });

    $$('[data-stop-playback]').forEach((btn) => {
      btn.addEventListener('click', () => stopAll());
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mode) {
        stopAll('Esc キーで再生を停止しました。');
      }
    });

    $('#btn-play-all-sents').addEventListener('click', () => {
      const items = L().sentences.map((s) => ({ kind: 'sentence', id: s.id, audio: s.audio, label: s.zh }));
      playQueue(items, '本文を順番に再生中…', 'sentence');
    });

    $('#sent-zh').addEventListener('click', (e) => {
      const w = e.target.closest('.word');
      if (!w) return;
      $('#now-word').innerHTML = `<span class="label">選択</span><span class="zh" lang="zh-CN">${w.dataset.word}</span><span class="py">${w.dataset.pinyin}</span>`;
      const vocab = L().words.find((x) => x.zh === w.dataset.word);
      if (vocab) {
        playQueue([{ kind: 'word', id: vocab.id, audio: vocab.audio, label: vocab.zh }], `単語：${vocab.zh}`, 'word');
      }
    });

    $$('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        const target = btn.dataset.target;
        show[target][key] = !show[target][key];
        const isOn = show[target][key];
        btn.classList.toggle('is-on', isOn);
        btn.setAttribute('aria-pressed', String(isOn));
        btn.textContent = key === 'py'
          ? (isOn ? 'ピンインON' : 'ピンインOFF')
          : (isOn ? '日本語ON' : '日本語OFF');

        if (target === 'words') {
          $$('.word-card').forEach((card) => {
            card.classList.toggle(`${key}-off`, !isOn);
          });
        } else {
          const stage = $('#sent-stage');
          stage.classList.toggle(`${key}-off`, !isOn);
          if (key === 'py') $('#sent-zh').classList.toggle('pinyin-hidden', !isOn);
        }

        const label = key === 'py' ? 'ピンイン' : '日本語';
        setStatus(`${label}表示を${isOn ? 'オン' : 'オフ'}にしました。`, mode ? 'playing' : 'idle');
      });
    });

    $('#speed-words').addEventListener('change', (e) => {
      if (mode === 'word') player.playbackRate = Number(e.target.value);
      setStatus(`単語の再生速度を${e.target.options[e.target.selectedIndex].text}に変更しました。`, mode ? 'playing' : 'idle');
    });
    $('#speed-sents').addEventListener('change', (e) => {
      if (mode === 'sentence') player.playbackRate = Number(e.target.value);
      setStatus(`本文の再生速度を${e.target.options[e.target.selectedIndex].text}に変更しました。`, mode ? 'playing' : 'idle');
    });

    player.addEventListener('ended', playNext);
    player.addEventListener('timeupdate', updateKaraoke);
    player.addEventListener('seeked', updateKaraoke);
    player.addEventListener('error', () => {
      if (!mode || !player.getAttribute('src')) return;
      stopAll('音声を読み込めませんでした。音声ファイルの配置を確認してください。', 'error');
    });
  }

  function setupMobileDock() {
    const links = $$('.mobile-dock [data-dock]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    links[0]?.classList.add('is-active');
    const sections = ['words', 'sentences']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const id = visible.target.id;
      links.forEach((a) => a.classList.toggle('is-active', a.dataset.dock === id));
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0.01, 0.25, 0.5] });
    sections.forEach((section) => io.observe(section));
  }
  function boot() {
    if (!window.LESSON) {
      setTimeout(boot, 30);
      return;
    }
    renderWords();
    renderSentenceStage();
    bind();
    setPlaybackActive(false);
    setupMobileDock();
    setStatus('準備OK。単語カードをタップして始めましょう。', 'idle');
  }

  boot();
})();

