(() => {
  "use strict";

  const GameState = Object.freeze({ MENU: "MENU", PLAYING: "PLAYING", MOVING: "MOVING", GAME_OVER: "GAME_OVER", PAUSED: "PAUSED" });
  const TileType = Object.freeze({ SAFE: "safe", LAVA: "lava" });
  const CONFIG = {
    columns: 5,
    bufferRowsAhead: 16,
    bufferRowsBehind: 4,
    startColumn: 2,
    moveDuration: 185,
    storageKey: "floor-is-lava-best-score",
    baseScrollSpeed: 0.9,
    scrollSpeedPerScore: 0.03,
    maxScrollSpeed: 4.5,
    lavaStartGap: 5
  };

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestScoreEl = document.getElementById("bestScore");
  const timerFill = document.getElementById("timerFill");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const playButton = document.getElementById("playButton");
  const soundToggle = document.getElementById("soundToggle");
  const vibrationToggle = document.getElementById("vibrationToggle");

  const analytics = { track(name, data = {}) { console.info("[analytics]", name, data); } };
  const ads = { maybeShowInterstitial() {}, requestRewardedContinue() { return Promise.resolve(false); } };

  class DifficultyManager {
    getLevel(score) { return Math.floor(score / 8) + 1; }
    getScrollSpeed(score) { return Math.min(CONFIG.maxScrollSpeed, CONFIG.baseScrollSpeed + score * CONFIG.scrollSpeedPerScore); }
    getExtraSafeChance(score) { return Math.max(0.14, 0.42 - score * 0.011); }
    getMoveDuration(score) { return Math.max(108, CONFIG.moveDuration - score * 1.4); }
  }

  class ScoreManager {
    constructor() {
      this.score = 0;
      this.bestScore = Number(localStorage.getItem(CONFIG.storageKey) || 0);
      bestScoreEl.textContent = this.bestScore;
    }
    reset() { this.score = 0; this.render(); }
    addPoint(level) {
      this.score += 1;
      this.render();
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem(CONFIG.storageKey, String(this.bestScore));
        bestScoreEl.textContent = this.bestScore;
        analytics.track("new_best_score", { score: this.score, best_score: this.bestScore, difficulty_level: level });
      }
    }
    render() { scoreEl.textContent = this.score; }
  }

  class AudioManager {
    constructor() { this.enabled = true; this.context = null; }
    setEnabled(enabled) {
      this.enabled = enabled;
      soundToggle.textContent = enabled ? "Sound On" : "Sound Off";
      soundToggle.setAttribute("aria-pressed", String(enabled));
    }
    play(type) {
      if (!this.enabled) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context ||= new AudioContext();
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const tone = { step: [520, 0.055, "triangle"], land: [720, 0.06, "sine"], lava: [120, 0.22, "sawtooth"], timeout: [180, 0.2, "triangle"] }[type] || [440, 0.08, "sine"];
      osc.type = tone[2];
      osc.frequency.setValueAtTime(tone[0], now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + tone[1]);
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start(now);
      osc.stop(now + tone[1] + 0.03);
    }
  }

  class VibrationManager {
    constructor() { this.enabled = true; }
    setEnabled(enabled) {
      this.enabled = enabled;
      vibrationToggle.textContent = enabled ? "Vibration On" : "Vibration Off";
      vibrationToggle.setAttribute("aria-pressed", String(enabled));
    }
    pulse(pattern) { if (this.enabled && navigator.vibrate) navigator.vibrate(pattern); }
  }

  class BoardManager {
    constructor(difficulty) { this.difficulty = difficulty; this.rows = []; this.highestRow = 0; this.guaranteedColumn = CONFIG.startColumn; this.reachableCols = new Set([CONFIG.startColumn]); }
    reset() {
      this.rows = [];
      this.highestRow = 0;
      this.guaranteedColumn = CONFIG.startColumn;
      this.reachableCols = new Set([CONFIG.startColumn]);
      this.rows.push(this.createStartRow(0));
      while (this.highestRow < CONFIG.bufferRowsAhead) this.appendRow(0);
    }
    createStartRow(index) {
      return { index, tiles: Array.from({ length: CONFIG.columns }, (_, column) => ({ type: column === CONFIG.startColumn ? TileType.SAFE : TileType.LAVA, guaranteed: column === CONFIG.startColumn })) };
    }
    appendRow(score) {
      const prevRow = this.rows[this.rows.length - 1];
      const prevSafe = [];
      for (let column = 0; column < CONFIG.columns; column += 1) if (prevRow.tiles[column].type === TileType.SAFE) prevSafe.push(column);
      const anchor = this.guaranteedColumn;
      const choices = [-1, 0, 1].map(offset => anchor + offset).filter(column => column >= 0 && column < CONFIG.columns);
      const guaranteedColumn = choices[Math.floor(Math.random() * choices.length)];
      const tiles = Array.from({ length: CONFIG.columns }, () => ({ type: TileType.LAVA, guaranteed: false }));
      for (const column of prevSafe) {
        const neighbors = [column - 1, column, column + 1].filter(c => c >= 0 && c < CONFIG.columns);
        neighbors.sort((a, b) => Math.abs(a - guaranteedColumn) - Math.abs(b - guaranteedColumn));
        tiles[neighbors[0]].type = TileType.SAFE;
      }
      tiles[guaranteedColumn].type = TileType.SAFE;
      tiles[guaranteedColumn].guaranteed = true;
      const chance = this.difficulty.getExtraSafeChance(score);
      for (let column = 0; column < CONFIG.columns; column += 1) {
        if (!tiles[column].guaranteed && Math.random() < chance) tiles[column].type = TileType.SAFE;
      }
      const newReach = new Set();
      for (let column = 0; column < CONFIG.columns; column += 1) {
        if (tiles[column].type !== TileType.SAFE) continue;
        for (const rc of prevSafe) { if (Math.abs(column - rc) <= 1) { newReach.add(column); break; } }
      }
      this.guaranteedColumn = guaranteedColumn;
      this.reachableCols = newReach;
      this.highestRow += 1;
      this.rows.push({ index: this.highestRow, tiles });
    }
    maintainRows(playerRow, score) {
      while (this.highestRow < playerRow + CONFIG.bufferRowsAhead) this.appendRow(score);
      const minRow = Math.max(0, playerRow - CONFIG.bufferRowsBehind);
      this.rows = this.rows.filter(row => row.index >= minRow);
    }
    getTile(rowIndex, column) { return this.rows.find(row => row.index === rowIndex)?.tiles[column] || null; }
  }

  class PlayerController {
    constructor() { this.reset(); }
    reset() { this.row = 0; this.column = CONFIG.startColumn; this.renderRow = 0; this.renderColumn = CONFIG.startColumn; this.move = null; this.landPulse = 0; }
    canMoveTo(row, column) { return row === this.row + 1 && Math.abs(column - this.column) <= 1; }
    startMove(row, column, duration, now) { this.move = { fromRow: this.row, fromColumn: this.column, toRow: row, toColumn: column, start: now, duration }; }
    update(now) {
      if (!this.move) return false;
      const t = Math.min(1, (now - this.move.start) / this.move.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.renderRow = lerp(this.move.fromRow, this.move.toRow, eased);
      this.renderColumn = lerp(this.move.fromColumn, this.move.toColumn, eased);
      if (t >= 1) {
        this.row = this.move.toRow;
        this.column = this.move.toColumn;
        this.renderRow = this.row;
        this.renderColumn = this.column;
        this.move = null;
        this.landPulse = 1;
        return true;
      }
      return false;
    }
  }

  class UIManager {
    showMenu() { overlay.classList.remove("hidden"); overlayText.textContent = "Tap the green tile in the next row. The lava rises — keep climbing!"; playButton.textContent = "Play"; }
    showGameOver(reason, score, best) { overlay.classList.remove("hidden"); overlayText.textContent = `${reason} Score ${score}. Best ${best}.`; playButton.textContent = "Play Again"; }
    hideOverlay() { overlay.classList.add("hidden"); }
    updateDanger(ratio) {
      const safe = Math.max(0, Math.min(1, ratio));
      timerFill.style.transform = `scaleX(${safe})`;
      timerFill.style.filter = safe < 0.35 ? "saturate(1.4) brightness(1.1)" : "none";
    }
  }

  class Renderer {
    constructor(board, player) { this.board = board; this.player = player; this.cameraRow = 0; this.resize(); }
    resize() {
      const ratio = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const rect = canvas.getBoundingClientRect();
      this.width = rect.width || 420;
      this.height = rect.height || 760;
      canvas.width = Math.floor(this.width * ratio);
      canvas.height = Math.floor(this.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.gap = Math.max(5, Math.floor(this.width * 0.012));
      this.tileSize = Math.floor((this.width - 28 - this.gap * (CONFIG.columns - 1)) / CONFIG.columns);
      this.boardWidth = CONFIG.columns * this.tileSize + (CONFIG.columns - 1) * this.gap;
      this.left = (this.width - this.boardWidth) / 2;
    }
    draw(now) {
      this.cameraRow = lerp(this.cameraRow, this.player.renderRow, 0.12);
      const baseY = this.height * 0.69;
      const step = this.tileSize + this.gap;
      ctx.clearRect(0, 0, this.width, this.height);
      this.drawBackground(now);
      for (const row of this.board.rows) {
        const y = baseY - (row.index - this.cameraRow) * step;
        if (y < -this.tileSize * 1.5 || y > this.height + this.tileSize) continue;
        for (let column = 0; column < CONFIG.columns; column += 1) {
          const x = this.left + column * step;
          this.drawTile(x, y, this.tileSize, row.tiles[column], now, row.index, column);
        }
      }
      const lavaSurfaceY = baseY - (game.lavaRow - this.cameraRow) * step + this.tileSize / 2;
      this.drawRisingLava(now, lavaSurfaceY);
      this.drawReachHints(baseY);
      this.drawPlayer(baseY, now);
    }
    drawBackground(now) {
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, "#1f202a"); gradient.addColorStop(0.55, "#15151d"); gradient.addColorStop(1, "#08080c");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
    }
    drawRisingLava(now, surfaceY) {
      if (surfaceY >= this.height) return;
      const top = Math.max(0, surfaceY);
      const gradient = ctx.createLinearGradient(0, top, 0, this.height);
      gradient.addColorStop(0, "#ff8a3c"); gradient.addColorStop(0.35, "#ef4f2f"); gradient.addColorStop(1, "#5a1410");
      ctx.fillStyle = gradient; ctx.fillRect(0, top, this.width, this.height - top);
      ctx.strokeStyle = "rgba(255,214,140,.95)"; ctx.lineWidth = 3; ctx.beginPath();
      for (let x = 0; x <= this.width; x += 12) {
        const yy = surfaceY + Math.sin(x * 0.05 + now * 0.006) * 6;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    drawTile(x, y, size, tile, now, row, column) {
      const safe = tile.type === TileType.SAFE;
      ctx.save(); ctx.translate(x + size / 2, y + size / 2); ctx.rotate((column - 2) * 0.012); ctx.translate(-size / 2, -size / 2);
      ctx.shadowColor = safe ? "rgba(115,209,106,.24)" : "rgba(240,91,47,.42)";
      ctx.shadowBlur = safe ? 10 : 18 + Math.sin(now * 0.008 + row) * 10;
      ctx.fillStyle = safe ? "#3b9f52" : "#972d23"; roundRect(ctx, 0, 0, size, size, 8); ctx.fill();
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      if (safe) { gradient.addColorStop(0, "#86dd79"); gradient.addColorStop(1, "#1f6c3c"); }
      else { gradient.addColorStop(0, "#ff9f43"); gradient.addColorStop(0.48, "#ef4f2f"); gradient.addColorStop(1, "#611515"); }
      ctx.fillStyle = gradient; roundRect(ctx, 4, 4, size - 8, size - 8, 7); ctx.fill();
      if (safe) {
        ctx.strokeStyle = tile.guaranteed ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.18)";
        ctx.lineWidth = tile.guaranteed ? 3 : 1; roundRect(ctx, 8, 8, size - 16, size - 16, 5); ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255,217,102,.34)";
        for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(size * (0.22 + i * 0.24), size * (0.32 + Math.sin(now * 0.006 + i + row) * 0.18), Math.max(3, size * 0.045), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
    drawReachHints(baseY) {
      if (game.state !== GameState.PLAYING) return;
      const row = this.player.row + 1;
      for (let column = this.player.column - 1; column <= this.player.column + 1; column += 1) {
        if (column < 0 || column >= CONFIG.columns) continue;
        const y = baseY - (row - this.cameraRow) * (this.tileSize + this.gap);
        const x = this.left + column * (this.tileSize + this.gap);
        ctx.strokeStyle = "rgba(247,244,233,.72)"; ctx.lineWidth = 2; roundRect(ctx, x + 3, y + 3, this.tileSize - 6, this.tileSize - 6, 8); ctx.stroke();
      }
    }
    drawPlayer(baseY, now) {
      const x = this.left + this.player.renderColumn * (this.tileSize + this.gap) + this.tileSize / 2;
      const y = baseY - (this.player.renderRow - this.cameraRow) * (this.tileSize + this.gap) + this.tileSize / 2;
      const bounce = this.player.move ? Math.sin(now * 0.04) * 7 : this.player.landPulse * -8;
      this.player.landPulse = Math.max(0, this.player.landPulse - 0.05);
      ctx.save(); ctx.translate(x, y + bounce);
      ctx.fillStyle = "rgba(0,0,0,.24)"; ctx.beginPath(); ctx.ellipse(0, this.tileSize * 0.28, this.tileSize * 0.24, this.tileSize * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      const r = this.tileSize * 0.22;
      const gradient = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 2, 0, 0, r);
      gradient.addColorStop(0, "#fff"); gradient.addColorStop(0.28, "#f9db78"); gradient.addColorStop(1, "#e44d35");
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      const ratio = game.getDangerRatio(); ctx.strokeStyle = ratio > 0.35 ? "#f7f4e9" : "#ff7558"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio); ctx.stroke();
      ctx.restore();
    }
    tileFromPointer(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left; const y = clientY - rect.top; const baseY = this.height * 0.69; const step = this.tileSize + this.gap;
      const boardX = x - this.left;
      const column = Math.round((boardX - this.tileSize / 2) / step);
      if (column < 0 || column >= CONFIG.columns) return null;
      const row = Math.round(this.cameraRow + (baseY + this.tileSize / 2 - y) / step);
      return { row, column };
    }
  }

  class GameManager {
    constructor() {
      this.state = GameState.MENU; this.previousState = GameState.MENU; this.difficulty = new DifficultyManager(); this.score = new ScoreManager(); this.audio = new AudioManager(); this.vibration = new VibrationManager(); this.board = new BoardManager(this.difficulty); this.player = new PlayerController(); this.ui = new UIManager(); this.renderer = new Renderer(this.board, this.player); this.lavaRow = 0; this.lastFrame = 0; this.startedAt = 0;
    }
    boot() { this.board.reset(); this.renderer.resize(); this.ui.showMenu(); this.bindEvents(); requestAnimationFrame(now => this.loop(now)); }
    bindEvents() {
      window.addEventListener("resize", () => this.renderer.resize());
      window.addEventListener("blur", () => this.pause()); window.addEventListener("focus", () => this.resume());
      document.addEventListener("visibilitychange", () => document.hidden ? this.pause() : this.resume());
      canvas.addEventListener("pointerdown", event => { event.preventDefault(); this.handlePointer(event.clientX, event.clientY); });
      playButton.addEventListener("click", () => this.state === GameState.GAME_OVER ? this.restart() : this.startGame());
      soundToggle.addEventListener("click", () => this.audio.setEnabled(!this.audio.enabled));
      vibrationToggle.addEventListener("click", () => this.vibration.setEnabled(!this.vibration.enabled));
    }
    startGame() { this.state = GameState.PLAYING; this.score.reset(); this.player.reset(); this.board.reset(); this.lavaRow = this.player.row - CONFIG.lavaStartGap; this.lastFrame = 0; this.startedAt = performance.now(); this.ui.hideOverlay(); analytics.track("game_start"); }
    restart() { analytics.track("game_restart", this.eventData()); this.startGame(); }
    handlePointer(clientX, clientY) {
      if (this.state !== GameState.PLAYING) return;
      const target = this.renderer.tileFromPointer(clientX, clientY);
      if (!target || !this.player.canMoveTo(target.row, target.column)) return;
      const tile = this.board.getTile(target.row, target.column); if (!tile) return;
      if (tile.type === TileType.LAVA) { analytics.track("lava_tile_selected", this.eventData()); this.audio.play("lava"); this.vibration.pulse([90, 35, 130]); this.endGame("Lava got you."); return; }
      analytics.track("safe_tile_selected", this.eventData()); this.audio.play("step"); this.vibration.pulse(20); this.state = GameState.MOVING; this.player.startMove(target.row, target.column, this.difficulty.getMoveDuration(this.score.score), performance.now());
    }
    loop(now) { this.update(now); this.renderer.draw(now); requestAnimationFrame(next => this.loop(next)); }
    update(now) {
      const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
      this.lastFrame = now;
      if (this.state === GameState.PLAYING || this.state === GameState.MOVING) {
        this.lavaRow += dt * this.difficulty.getScrollSpeed(this.score.score);
        if (this.player.renderRow <= this.lavaRow) {
          analytics.track("lava_caught", this.eventData());
          this.audio.play("timeout");
          this.vibration.pulse([70, 40, 110]);
          this.endGame("The lava caught you.");
          return;
        }
      }
      if (this.state === GameState.PLAYING) this.ui.updateDanger(this.getDangerRatio());
      if (this.state === GameState.MOVING && this.player.update(now)) {
        this.score.addPoint(this.difficulty.getLevel(this.score.score));
        this.board.maintainRows(this.player.row, this.score.score);
        this.audio.play("land"); this.state = GameState.PLAYING;
      }
    }
    pause() { if (this.state !== GameState.PLAYING && this.state !== GameState.MOVING) return; this.previousState = this.state; this.state = GameState.PAUSED; }
    resume() { if (this.state !== GameState.PAUSED) return; this.state = this.previousState === GameState.MOVING ? GameState.MOVING : GameState.PLAYING; this.lastFrame = 0; }
    endGame(reason) { if (this.state === GameState.GAME_OVER) return; this.state = GameState.GAME_OVER; ads.maybeShowInterstitial(); analytics.track("game_over", { ...this.eventData(), reason }); this.ui.showGameOver(reason, this.score.score, this.score.bestScore); }
    getDangerRatio() {
      if (this.state !== GameState.PLAYING && this.state !== GameState.MOVING) return 1;
      const distance = this.player.renderRow - this.lavaRow;
      return Math.max(0, Math.min(1, distance / CONFIG.lavaStartGap));
    }
    eventData() { return { score: this.score.score, best_score: this.score.bestScore, game_duration: Math.round(performance.now() - this.startedAt), difficulty_level: this.difficulty.getLevel(this.score.score) }; }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function roundRect(context, x, y, width, height, radius) { const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r); context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r); context.arcTo(x, y, x + width, y, r); context.closePath(); }

  const game = new GameManager();
  game.boot();
})();
