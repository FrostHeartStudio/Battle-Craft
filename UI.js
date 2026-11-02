
import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class UI {
  constructor(player, game) {
    this.player = player;
    this.game = game;

    this.joystick = document.getElementById('joystick');
    this.joyKnob = document.getElementById('joyKnob');

    this.fireBtn = document.getElementById('fireBtn');
    this.reloadBtn = document.getElementById('reloadBtn');
    this.jumpBtn = document.getElementById('jumpBtn');
    this.scopeBtn = document.getElementById('scopeBtn');

    this.mapCanvas = document.getElementById('mapCanvas');
    this.ctx = this.mapCanvas.getContext('2d');

    this.joyActive = false;
    this.joyPointer = null;

    this.joyX = 0;
    this.joyY = 0;

    this.lookPointer = null;
    this.lastLookX = 0;
    this.lastLookY = 0;
    this.pendingLookX = 0;
    this.pendingLookY = 0;

    this.fireActive = false;

    this.setupJoystick();
    this.setupLook();
    this.setupButtons();
  }

  setupJoystick() {
    this.joystick.addEventListener(
      'pointerdown',
      e => {
        e.preventDefault();

        this.joyActive = true;
        this.joyPointer = e.pointerId;

        this.joystick.setPointerCapture(e.pointerId);

        this.updateJoystick(e);
      }
    );

    this.joystick.addEventListener(
      'pointermove',
      e => {
        if (
          !this.joyActive ||
          e.pointerId !== this.joyPointer
        ) return;

        this.updateJoystick(e);
      }
    );

    const endJoystick = e => {
      if (e.pointerId !== this.joyPointer) return;

      this.joyActive = false;
      this.joyPointer = null;

      this.joyX = 0;
      this.joyY = 0;

      this.joyKnob.style.transform =
        'translate(0px, 0px)';

      this.player.setMovement(0, 0);
    };

    this.joystick.addEventListener(
      'pointerup', endJoystick
    );

    this.joystick.addEventListener(
      'pointercancel', endJoystick
    );
  }

  updateJoystick(e) {
    const rect = this.joystick.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    const max = 35;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > max) {
      dx = dx / length * max;
      dy = dy / length * max;
    }

    this.joyKnob.style.transform =
      `translate(${dx}px, ${dy}px)`;

    this.joyX = dx / max;
    this.joyY = dy / max;

    // MAJU / MUNDUR / KIRI / KANAN
    this.player.setMovement(
      -this.joyY,
      this.joyX
    );
  }

  setupLook() {
    const gameElement = document.getElementById('game');

    gameElement.addEventListener(
      'pointerdown',
      e => {
        if (
          e.target.closest('#joystick') ||
          e.target.closest('#fireBtn') ||
          e.target.closest('#reloadBtn') ||
          e.target.closest('#jumpBtn') ||
          e.target.closest('#scopeBtn')
        ) return;

        if (e.pointerType === 'mouse') {
          if (document.pointerLockElement !== gameElement) {
            gameElement.requestPointerLock();
            return;
          }
        }

        this.lookPointer = e.pointerId;
        this.lastLookX = e.clientX;
        this.lastLookY = e.clientY;
        try { gameElement.setPointerCapture(e.pointerId); } catch {}
      }
    );

    gameElement.addEventListener(
      'pointermove',
      e => {
        if (e.pointerType === 'mouse') {
          if (document.pointerLockElement === gameElement) {
            this.player.rotate(
              e.movementX,
              e.movementY
            );
          }

          return;
        }

        if (e.pointerId !== this.lookPointer) return;

        const dx = e.clientX - this.lastLookX;
        const dy = e.clientY - this.lastLookY;

        this.lastLookX = e.clientX;
        this.lastLookY = e.clientY;

        // Simpan delta dulu, rotasi kamera diproses smooth pada tiap frame.
        this.pendingLookX += dx;
        this.pendingLookY += dy;
      }
    );

    const endLook = e => {
      if (e.pointerId === this.lookPointer) {
        this.lookPointer = null;
      }
    };

    gameElement.addEventListener('pointerup', endLook);
    gameElement.addEventListener('pointercancel', endLook);
  }

  setupButtons() {
    this.fireBtn.addEventListener(
      'pointerdown',
      e => {
        e.preventDefault();
        this.fireActive = true;
        this.game.startFiring();
      }
    );

    const stopFire = () => {
      this.fireActive = false;
      this.game.stopFiring();
    };

    this.fireBtn.addEventListener('pointerup', stopFire);
    this.fireBtn.addEventListener('pointercancel', stopFire);
    this.fireBtn.addEventListener('pointerleave', stopFire);

    this.jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.player.jump(); });
    this.scopeBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.game.toggleScope(); });

    this.reloadBtn.addEventListener(
      'pointerdown',
      e => {
        e.preventDefault();
        this.player.reload();
      }
    );
  }

  update(dt = 1/60) {
    const smooth = 1 - Math.exp(-22 * Math.max(0, dt));
    const dx = this.pendingLookX * smooth, dy = this.pendingLookY * smooth;
    this.pendingLookX -= dx; this.pendingLookY -= dy;
    if (Math.abs(dx) + Math.abs(dy) > 0.001) this.player.rotate(dx, dy, 0.006);
    this.updateHUD();
  }

  updateHUD() {
    const hp = Math.max(0, this.player.hp);

    document.getElementById('hpFill').style.width =
      `${(hp / this.player.maxHP) * 100}%`;

    document.getElementById('hpText').textContent =
      Math.ceil(hp);

    document.getElementById('ammoWeapon').textContent = (this.player.weaponType || 'pistol').toUpperCase();
    document.getElementById('ammoCount').textContent = `${this.player.ammo} / ∞`;

    document.getElementById('blueScore').textContent = this.game.blueScore;
    document.getElementById('redScore').textContent = this.game.redScore;
    document.getElementById('timer').textContent = this.game.getTimeString();

    this.drawMinimap();
    const damage = document.getElementById('damageOverlay');
    damage.style.opacity = this.player.damageFlash > 0 ? String(Math.min(0.72, this.player.damageFlash * 3.2)) : '0';
    const respawn = document.getElementById('respawnOverlay');
    respawn.style.display = this.player.alive ? 'none' : 'flex';
    document.getElementById('respawnCount').textContent = Math.max(0, Math.ceil(this.game.playerRespawnTimer));
  }

  drawMinimap() {
    const ctx = this.ctx;
    const canvas = this.mapCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#27372b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // JALAN
    ctx.fillStyle = '#596068';
    ctx.fillRect(0, 67, 150, 16);
    ctx.fillRect(67, 0, 16, 150);

    // BANGUNAN
    ctx.fillStyle = '#9aa0a5';

    const buildings = [
      [-60, -70, 18, 16],
      [-30, -80, 14, 20],
      [60, -70, 20, 16],
      [30, -80, 18, 18],
      [-70, -30, 20, 18],
      [70, -30, 18, 20],
      [-60, 60, 18, 18],
      [-30, 70, 20, 16],
      [60, 60, 20, 18],
      [30, 70, 18, 20]
    ];

    for (const [x, z, w, d] of buildings) {
      const px = (x + 120) / 240 * 150;
      const pz = (z + 120) / 240 * 150;

      ctx.fillRect(
        px - w / 2,
        pz - d / 2,
        w,
        d
      );
    }

    // PLAYER
    this.drawDot(
      this.player.position,
      '#4bb5ff',
      4
    );

    // BOT
    for (const bot of this.game.bots) {
      if (!bot.alive) continue;

      this.drawDot(
        bot.position,
        bot.team === 'blue' ? '#168cff' : '#ff3333',
        2.5
      );
    }
  }

  drawDot(position, color, radius) {
    const x = (position.x + 120) / 240 * 150;
    const z = (position.z + 120) / 240 * 150;

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, z, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
