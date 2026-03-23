// MuscleLove 筋肉スライドパズル - game.js

(function () {
  'use strict';

  // ===== STATE =====
  const state = {
    gridSize: 4,
    imageIndex: 0,
    tiles: [],       // flat array of tile values (0 = empty)
    emptyPos: 0,     // index of empty tile
    moves: 0,
    seconds: 0,
    timerInterval: null,
    isPlaying: false,
    isSolved: false,
    imageSrc: '',
  };

  const TOTAL_IMAGES = 10;

  // ===== DOM REFS =====
  const $ = (sel) => document.querySelector(sel);
  const startScreen = $('#start-screen');
  const gameScreen = $('#game-screen');
  const completeScreen = $('#complete-screen');
  const puzzleBoard = $('#puzzle-board');
  const moveCountEl = $('#move-count');
  const timerEl = $('#timer');
  const difficultyLabel = $('#difficulty-label');
  const referenceImage = $('#reference-image');
  const startBtn = $('#start-btn');
  const shuffleBtn = $('#shuffle-btn');
  const backBtn = $('#back-btn');
  const shareBtn = $('#share-btn');
  const retryBtn = $('#retry-btn');
  const homeBtn = $('#home-btn');
  const confettiCanvas = $('#confetti-canvas');
  const confettiCtx = confettiCanvas.getContext('2d');

  // ===== AUDIO (Web Audio API) =====
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playSlideSound() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) { /* audio not supported */ }
  }

  function playCorrectSound() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  function playFanfare() {
    try {
      const ctx = getAudioCtx();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.15;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } catch (e) {}
  }

  // ===== SCREEN MANAGEMENT =====
  function showScreen(screen) {
    [startScreen, gameScreen, completeScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ===== DIFFICULTY SELECTION =====
  document.querySelectorAll('.btn-difficulty').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.gridSize = parseInt(btn.dataset.size);
    });
  });

  // ===== IMAGE LOADING =====
  function getRandomImage() {
    state.imageIndex = Math.floor(Math.random() * TOTAL_IMAGES) + 1;
    state.imageSrc = `images/img${state.imageIndex}.png`;
  }

  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ===== SOLVABILITY =====
  // Count inversions (ignore the empty tile, value 0)
  function countInversions(arr) {
    let inv = 0;
    const filtered = arr.filter(v => v !== 0);
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        if (filtered[i] > filtered[j]) inv++;
      }
    }
    return inv;
  }

  function isSolvable(arr, size) {
    const inversions = countInversions(arr);
    if (size % 2 === 1) {
      // Odd grid: solvable if inversions even
      return inversions % 2 === 0;
    } else {
      // Even grid: solvable if (inversions + row of blank from bottom) is odd
      const emptyIndex = arr.indexOf(0);
      const emptyRowFromBottom = size - Math.floor(emptyIndex / size);
      return (inversions + emptyRowFromBottom) % 2 === 1;
    }
  }

  // ===== SHUFFLE =====
  function shuffleTiles() {
    const n = state.gridSize * state.gridSize;
    let arr;
    do {
      arr = [];
      for (let i = 1; i < n; i++) arr.push(i);
      arr.push(0); // empty at end initially

      // Fisher-Yates shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } while (!isSolvable(arr, state.gridSize) || isPuzzleSolved(arr));

    state.tiles = arr;
    state.emptyPos = arr.indexOf(0);
  }

  function isPuzzleSolved(arr) {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
      if (arr[i] !== i + 1) return false;
    }
    return arr[n - 1] === 0;
  }

  // ===== RENDER BOARD =====
  function renderBoard() {
    const size = state.gridSize;
    puzzleBoard.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    puzzleBoard.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    puzzleBoard.innerHTML = '';

    const boardRect = puzzleBoard.getBoundingClientRect();
    const gap = 3;
    const padding = 3;
    const totalGap = (size - 1) * gap + padding * 2;
    // We use background-size percentage approach instead
    const bgSizePercent = size * 100;

    state.tiles.forEach((val, index) => {
      const tile = document.createElement('div');
      tile.classList.add('puzzle-tile');
      tile.dataset.index = index;

      if (val === 0) {
        tile.classList.add('empty');
      } else {
        // val is 1-based, so tile "1" = top-left
        const origRow = Math.floor((val - 1) / size);
        const origCol = (val - 1) % size;

        // Use background-position percentage
        const xPercent = (origCol / (size - 1)) * 100;
        const yPercent = (origRow / (size - 1)) * 100;

        tile.style.backgroundImage = `url('${state.imageSrc}')`;
        tile.style.backgroundSize = `${bgSizePercent}% ${bgSizePercent}%`;
        tile.style.backgroundPosition = `${xPercent}% ${yPercent}%`;

        // Check if tile is in correct position
        if (val === index + 1) {
          tile.classList.add('correct');
        }

        // Tile number hint
        const numLabel = document.createElement('span');
        numLabel.className = 'tile-number';
        numLabel.textContent = val;
        tile.appendChild(numLabel);

        tile.addEventListener('click', () => onTileClick(index));
      }

      puzzleBoard.appendChild(tile);
    });
  }

  // ===== TILE CLICK =====
  function onTileClick(index) {
    if (!state.isPlaying || state.isSolved) return;

    const size = state.gridSize;
    const emptyPos = state.emptyPos;

    // Check adjacency
    const row = Math.floor(index / size);
    const col = index % size;
    const emptyRow = Math.floor(emptyPos / size);
    const emptyCol = emptyPos % size;

    const isAdjacent =
      (Math.abs(row - emptyRow) === 1 && col === emptyCol) ||
      (Math.abs(col - emptyCol) === 1 && row === emptyRow);

    if (!isAdjacent) return;

    // Swap
    state.tiles[emptyPos] = state.tiles[index];
    state.tiles[index] = 0;
    state.emptyPos = index;
    state.moves++;
    moveCountEl.textContent = state.moves;

    playSlideSound();
    renderBoard();

    // Check win
    if (isPuzzleSolved(state.tiles)) {
      onPuzzleComplete();
    }
  }

  // ===== TIMER =====
  function startTimer() {
    state.seconds = 0;
    state.moves = 0;
    moveCountEl.textContent = '0';
    timerEl.textContent = '00:00';
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.seconds++;
      const m = String(Math.floor(state.seconds / 60)).padStart(2, '0');
      const s = String(state.seconds % 60).padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerInterval);
  }

  function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  // ===== GAME START =====
  async function startGame() {
    getRandomImage();

    try {
      await preloadImage(state.imageSrc);
    } catch (e) {
      // Try another image
      getRandomImage();
      await preloadImage(state.imageSrc);
    }

    const selectedDiffBtn = document.querySelector('.btn-difficulty.selected');
    const label = selectedDiffBtn ? selectedDiffBtn.dataset.label : 'Normal';
    difficultyLabel.textContent = label;

    // Set reference image
    referenceImage.style.backgroundImage = `url('${state.imageSrc}')`;

    state.isPlaying = true;
    state.isSolved = false;
    shuffleTiles();
    renderBoard();
    startTimer();
    showScreen(gameScreen);
  }

  // ===== PUZZLE COMPLETE =====
  function onPuzzleComplete() {
    state.isPlaying = false;
    state.isSolved = true;
    stopTimer();
    playFanfare();

    setTimeout(() => {
      // Set completed image
      const completedImg = $('#completed-image');
      const completedBg = $('#completed-image-bg');
      completedImg.style.backgroundImage = `url('${state.imageSrc}')`;
      completedBg.style.backgroundImage = `url('${state.imageSrc}')`;

      // Set results
      $('#result-moves').textContent = state.moves;
      $('#result-time').textContent = formatTime(state.seconds);

      showScreen(completeScreen);
      launchConfetti();
    }, 400);
  }

  // ===== CONFETTI =====
  function launchConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#ff2d78', '#00e5ff', '#ffd700', '#ff6b9d', '#7b68ee', '#00ff88'];
    const count = 120;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * confettiCanvas.width,
        y: Math.random() * confettiCanvas.height - confettiCanvas.height,
        w: Math.random() * 10 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    let frame = 0;
    const maxFrames = 180;

    function animate() {
      if (frame >= maxFrames) {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        return;
      }
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rotation += p.rotSpeed;
        if (frame > maxFrames - 40) {
          p.opacity = Math.max(0, p.opacity - 0.03);
        }

        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.globalAlpha = p.opacity;
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        confettiCtx.restore();
      });

      frame++;
      requestAnimationFrame(animate);
    }
    animate();
  }

  // ===== SHARE =====
  function shareResult() {
    const diffNames = { 3: 'Easy(3×3)', 4: 'Normal(4×4)', 5: 'Hard(5×5)' };
    const diff = diffNames[state.gridSize] || 'Normal(4×4)';
    const text = `【筋肉スライドパズル】${state.moves}手・${formatTime(state.seconds)}でクリア！（${diff}）💪\n#MuscleLove #筋肉パズル\nhttps://www.patreon.com/cw/MuscleLove`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  // ===== EVENT LISTENERS =====
  startBtn.addEventListener('click', startGame);
  shuffleBtn.addEventListener('click', () => {
    if (!state.isPlaying) return;
    shuffleTiles();
    renderBoard();
    startTimer();
  });
  backBtn.addEventListener('click', () => {
    stopTimer();
    state.isPlaying = false;
    showScreen(startScreen);
  });
  shareBtn.addEventListener('click', shareResult);
  retryBtn.addEventListener('click', startGame);
  homeBtn.addEventListener('click', () => {
    showScreen(startScreen);
  });

  // Touch/swipe support on puzzle board
  let touchStartX = 0;
  let touchStartY = 0;

  puzzleBoard.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  puzzleBoard.addEventListener('touchend', (e) => {
    if (!state.isPlaying || state.isSolved) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 20) return; // too small

    const size = state.gridSize;
    const emptyRow = Math.floor(state.emptyPos / size);
    const emptyCol = state.emptyPos % size;
    let targetIndex = -1;

    if (absDx > absDy) {
      // Horizontal swipe - move tile into empty space from opposite direction
      if (dx > 0 && emptyCol > 0) {
        // Swipe right -> tile to the LEFT of empty moves right
        targetIndex = emptyRow * size + (emptyCol - 1);
      } else if (dx < 0 && emptyCol < size - 1) {
        targetIndex = emptyRow * size + (emptyCol + 1);
      }
    } else {
      if (dy > 0 && emptyRow > 0) {
        targetIndex = (emptyRow - 1) * size + emptyCol;
      } else if (dy < 0 && emptyRow < size - 1) {
        targetIndex = (emptyRow + 1) * size + emptyCol;
      }
    }

    if (targetIndex >= 0) {
      onTileClick(targetIndex);
    }
  }, { passive: true });

  // Keyboard support
  document.addEventListener('keydown', (e) => {
    if (!state.isPlaying || state.isSolved) return;
    const size = state.gridSize;
    const emptyRow = Math.floor(state.emptyPos / size);
    const emptyCol = state.emptyPos % size;
    let targetIndex = -1;

    switch (e.key) {
      case 'ArrowUp':
        if (emptyRow < size - 1) targetIndex = (emptyRow + 1) * size + emptyCol;
        break;
      case 'ArrowDown':
        if (emptyRow > 0) targetIndex = (emptyRow - 1) * size + emptyCol;
        break;
      case 'ArrowLeft':
        if (emptyCol < size - 1) targetIndex = emptyRow * size + (emptyCol + 1);
        break;
      case 'ArrowRight':
        if (emptyCol > 0) targetIndex = emptyRow * size + (emptyCol - 1);
        break;
    }

    if (targetIndex >= 0) {
      e.preventDefault();
      onTileClick(targetIndex);
    }
  });

  // Resize confetti canvas
  window.addEventListener('resize', () => {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  });

})();
