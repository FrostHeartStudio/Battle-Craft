
import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

import { checkCollision, BLUE_SPAWNS } from './Map.js';

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.hp = 100;
    this.maxHP = 100;

    this.speed = 10;
    this.radius = 0.65;

    this.alive = true;
    this.respawnTime = 10;
    this.onDeath = null;

    this.ammo = 30;
    this.reserveAmmo = Infinity;
    this.maxAmmo = 30;
    this.weaponType = 'pistol';

    this.reloading = false;

    this.yaw = 0;
    this.pitch = 0;

    this.moveForward = 0;
    this.moveRight = 0;

    this.spawnIndex = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.jumpRequested = false;
    this.damageFlash = 0;
    this.cameraShake = 0;

    this.position = new THREE.Vector3(
      -100, 1.7, -90
    );

    this.camera.position.copy(this.position);

    this.camera.rotation.order = 'YXZ';

    this.body = new THREE.Group();
    this.scene.add(this.body);

    // Kaki sederhana di kamera (terlihat di bagian bawah layar).
    this.legs = new THREE.Group();
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x26384b, roughness: 0.8 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.9 });
    for (const x of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 8), pantsMat);
      leg.position.set(x, -0.48, -0.38); this.legs.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.10, 0.25), bootMat);
      boot.position.set(x, -0.73, -0.46); this.legs.add(boot);
    }
    this.camera.add(this.legs);

    this.respawn();
  }

  update(dt) {
    if (!this.alive) return;

    this.move(dt);
    this.verticalVelocity -= 22 * dt;
    this.position.y += this.verticalVelocity * dt;
    if (this.position.y <= 1.7) { this.position.y = 1.7; this.verticalVelocity = 0; this.grounded = true; }
    if (this.jumpRequested && this.grounded) { this.verticalVelocity = 8.5; this.grounded = false; }
    this.jumpRequested = false;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    this.cameraShake = Math.max(0, this.cameraShake - dt);
    this.updateCamera();
  }

  move(dt) {
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    );

    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    );

    const movement = new THREE.Vector3();

    movement.addScaledVector(
      forward, this.moveForward
    );

    movement.addScaledVector(
      right, this.moveRight
    );

    if (movement.lengthSq() > 0) {
      movement.normalize();
      movement.multiplyScalar(this.speed * dt);

      const nextX = this.position.x + movement.x;
      const nextZ = this.position.z + movement.z;

      // COLLISION X
      if (!checkCollision(
        nextX, this.position.z, this.radius
      )) {
        this.position.x = nextX;
      }

      // COLLISION Z
      if (!checkCollision(
        this.position.x, nextZ, this.radius
      )) {
        this.position.z = nextZ;
      }
    }
  }

  updateCamera() {
    this.camera.position.copy(this.position);

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    if (this.cameraShake > 0) { this.camera.rotation.z = (Math.random() - 0.5) * this.cameraShake * 0.12; } else this.camera.rotation.z = 0;
  }

  jump() { if (this.alive && this.grounded) this.jumpRequested = true; }

  setMovement(forward, right) {
    this.moveForward = forward;
    this.moveRight = right;
  }

  rotate(dx, dy, sensitivity = 0.003) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;

    this.pitch = Math.max(
      -Math.PI / 2 + 0.05,
      Math.min(
        Math.PI / 2 - 0.05,
        this.pitch
      )
    );

    this.updateCamera();
  }

  damage(amount, attackerTeam = 'red') {
    if (!this.alive) return false;

    this.hp -= amount;
    this.damageFlash = 0.22;
    this.cameraShake = 0.18;
    if (this.onDamage) this.onDamage(amount);

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;

      this.moveForward = 0;
      this.moveRight = 0;
      if (this.onDeath) this.onDeath(attackerTeam);

      return true;
    }

    return false;
  }

  respawn() {
    this.hp = this.maxHP;
    this.alive = true;
    this.verticalVelocity = 0; this.grounded = true; this.jumpRequested = false;
    this.moveForward = 0; this.moveRight = 0;

    const spawn = BLUE_SPAWNS[
      this.spawnIndex % BLUE_SPAWNS.length
    ];

    this.spawnIndex++;

    this.position.set(
      spawn[0],
      1.7,
      spawn[2]
    );

    this.yaw = Math.PI / 4;
    this.pitch = 0;

    this.camera.position.copy(this.position);
    this.updateCamera();
  }

  reload() {
    if (
      this.reloading ||
      this.ammo === this.maxAmmo ||
      this.ammo >= this.maxAmmo
    ) return false;

    this.reloading = true;
    this.playReloadSound();

    setTimeout(() => {
      if (!this.alive) {
        this.reloading = false;
        return;
      }

      const needed = this.maxAmmo - this.ammo;
      const amount = needed;
      this.ammo += amount;

      this.reloading = false;
    }, 1800);

    return true;
  }

  playReloadSound() {
    try { const C=window.AudioContext||window.webkitAudioContext; if(!C)return; this.audio ||= new C(); if(this.audio.state==='suspended')this.audio.resume(); const c=this.audio,n=c.currentTime;
      const osc=c.createOscillator(),g=c.createGain();osc.type='square';osc.frequency.setValueAtTime(720,n);osc.frequency.exponentialRampToValueAtTime(260,n+.12);g.gain.setValueAtTime(.07,n);g.gain.exponentialRampToValueAtTime(.001,n+.16);osc.connect(g);g.connect(c.destination);osc.start(n);osc.stop(n+.16);
      const o=c.createOscillator(),gg=c.createGain();o.type='triangle';o.frequency.setValueAtTime(420,n+.22);o.frequency.exponentialRampToValueAtTime(900,n+.32);gg.gain.setValueAtTime(.05,n+.22);gg.gain.exponentialRampToValueAtTime(.001,n+.38);o.connect(gg);gg.connect(c.destination);o.start(n+.22);o.stop(n+.38);
    } catch {}
  }

  getPosition() {
    return this.position.clone();
  }

  getDirection() {
    const direction = new THREE.Vector3(
      0, 0, -1
    );

    direction.applyQuaternion(
      this.camera.quaternion
    );

    return direction.normalize();
  }
}
