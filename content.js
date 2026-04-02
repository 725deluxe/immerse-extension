// Immerse — Content Script
// YouTubeの動画ページにABリピート・速度変更・学習ログパネルを追加する

(function() {
  'use strict';

  // すでに注入済みならスキップ
  if (document.getElementById('immerse-panel')) return;

  let pointA = null;
  let pointB = null;
  let loopCount = 0;
  let sessionSeconds = 0;
  let sessionTimer = null;
  let pollTimer = null;
  let currentSpeed = 1.0;
  let isTracking = false;

  // ── ストレージ ──
  function getStorage(key, def) {
    const v = localStorage.getItem('immerse_' + key);
    return v !== null ? JSON.parse(v) : def;
  }
  function setStorage(key, val) {
    localStorage.setItem('immerse_' + key, JSON.stringify(val));
  }

  let totalLoops = getStorage('totalLoops', 0);
  let todayKey = new Date().toISOString().slice(0, 10);
  let todaySeconds = getStorage('today_' + todayKey, 0);

  // ── 動画要素を取得 ──
  function getVideo() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  // ── パネルを作成 ──
  function createPanel() {
    if (document.getElementById('immerse-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'immerse-panel';
    panel.innerHTML = `
      <div class="im-header">
        <span class="im-logo">Im<em>merse</em></span>
        <div class="im-session">
          <div class="im-stat">
            <span class="im-val" id="im-today">0:00</span>
            <span class="im-lbl">今日</span>
          </div>
          <div class="im-stat">
            <span class="im-val" id="im-total-loops">0</span>
            <span class="im-lbl">総ループ</span>
          </div>
        </div>
      </div>

      <div class="im-section">
        <div class="im-section-label">速度</div>
        <div class="im-speed-row" id="im-speed-row">
          <button class="im-speed" data-speed="0.5">0.5×</button>
          <button class="im-speed" data-speed="0.75">0.75×</button>
          <button class="im-speed active" data-speed="1">1×</button>
          <button class="im-speed" data-speed="1.25">1.25×</button>
          <button class="im-speed" data-speed="1.5">1.5×</button>
        </div>
      </div>

      <div class="im-section">
        <div class="im-section-label">AB リピート</div>
        <div class="im-ab-row">
          <button class="im-ab-btn im-a" id="im-btn-a">A 点</button>
          <button class="im-ab-btn im-b" id="im-btn-b">B 点</button>
          <button class="im-ab-clear" id="im-btn-clear">クリア</button>
        </div>
        <div class="im-ab-times" id="im-ab-times"></div>
      </div>

      <div class="im-section im-loop-section">
        <div class="im-loop-display">
          <span class="im-loop-num" id="im-loop-num">0</span>
          <span class="im-loop-unit">ループ</span>
        </div>
        <button class="im-reset" id="im-loop-reset">リセット</button>
      </div>
    `;

    document.body.appendChild(panel);
    bindEvents(panel);
    updateTodayDisplay();
    document.getElementById('im-total-loops').textContent = totalLoops;
  }

  // ── イベント ──
  function bindEvents(panel) {
    // 速度ボタン
    panel.querySelectorAll('.im-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = parseFloat(btn.dataset.speed);
        setSpeed(s);
      });
    });

    // AB
    document.getElementById('im-btn-a').addEventListener('click', setA);
    document.getElementById('im-btn-b').addEventListener('click', setB);
    document.getElementById('im-btn-clear').addEventListener('click', clearAB);
    document.getElementById('im-loop-reset').addEventListener('click', () => {
      loopCount = 0;
      document.getElementById('im-loop-num').textContent = 0;
    });
  }

  function setSpeed(s) {
    currentSpeed = s;
    const video = getVideo();
    if (video) video.playbackRate = s;
    document.querySelectorAll('.im-speed').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === s);
    });
  }

  function setA() {
    const video = getVideo();
    if (!video) return;
    pointA = video.currentTime;
    document.getElementById('im-btn-a').classList.add('set');
    updateABTimes();
  }

  function setB() {
    const video = getVideo();
    if (!video) return;
    const t = video.currentTime;
    if (pointA !== null && t <= pointA) {
      alert('B点はA点より後に設定してください');
      return;
    }
    pointB = t;
    document.getElementById('im-btn-b').classList.add('set');
    if (pointA !== null) video.currentTime = pointA;
    updateABTimes();
  }

  function clearAB() {
    pointA = null;
    pointB = null;
    document.getElementById('im-btn-a').classList.remove('set');
    document.getElementById('im-btn-b').classList.remove('set');
    document.getElementById('im-ab-times').textContent = '';
  }

  function updateABTimes() {
    let txt = '';
    if (pointA !== null) txt += 'A: ' + fmt(pointA);
    if (pointA !== null && pointB !== null) txt += '  →  B: ' + fmt(pointB);
    document.getElementById('im-ab-times').textContent = txt;
  }

  // ── ポーリング（ABチェック・速度維持） ──
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      const video = getVideo();
      if (!video || video.paused) return;

      // 速度維持（YouTubeが勝手にリセットすることがある）
      if (Math.abs(video.playbackRate - currentSpeed) > 0.05) {
        video.playbackRate = currentSpeed;
      }

      // ABループチェック
      if (pointA !== null && pointB !== null) {
        if (video.currentTime >= pointB - 0.15) {
          loopCount++;
          totalLoops++;
          document.getElementById('im-loop-num').textContent = loopCount;
          document.getElementById('im-total-loops').textContent = totalLoops;
          setStorage('totalLoops', totalLoops);
          video.currentTime = pointA;
        }
      }

      // 動画終了時（ABなし）のループ
      if (pointA === null && pointB === null) {
        if (video.currentTime >= video.duration - 0.3 && video.duration > 0) {
          loopCount++;
          totalLoops++;
          document.getElementById('im-loop-num').textContent = loopCount;
          document.getElementById('im-total-loops').textContent = totalLoops;
          setStorage('totalLoops', totalLoops);
          video.currentTime = 0;
          video.play();
        }
      }
    }, 200);
  }

  // ── セッションタイマー ──
  function startSessionTracking() {
    if (sessionTimer) return;
    sessionTimer = setInterval(() => {
      const video = getVideo();
      if (video && !video.paused) {
        sessionSeconds++;
        todaySeconds++;
        setStorage('today_' + todayKey, todaySeconds);
        updateTodayDisplay();
      }
    }, 1000);
  }

  function updateTodayDisplay() {
    const el = document.getElementById('im-today');
    if (el) el.textContent = fmt(todaySeconds);
  }

  // ── ユーティリティ ──
  function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    s = Math.floor(s);
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  }

  // ── 動画ページかどうか判定して起動 ──
  function isVideoPage() {
    return location.href.includes('/watch') || location.href.includes('/shorts/');
  }

  function init() {
    if (!isVideoPage()) return;
    createPanel();
    startPoll();
    startSessionTracking();
  }

  // ── SPAナビゲーション対応 ──
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // パネル再注入
      const old = document.getElementById('immerse-panel');
      if (old) old.remove();
      pointA = null; pointB = null; loopCount = 0;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      setTimeout(() => init(), 1500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 初回起動
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

  // YouTube動画ページへの遷移が遅い場合の保険
  setTimeout(() => {
    if (!document.getElementById('immerse-panel')) init();
  }, 2000);

})();
