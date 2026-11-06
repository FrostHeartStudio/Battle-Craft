import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { hasLineOfSight } from './Map.js';
import { WeaponAnimation } from './animation.js';

export class Weapons {
  constructor(scene, camera, player) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.weaponType = 'pistol';
    this.damage = 20;
    this.range = 70;
    this.fireRate = 220;
    this.magSize = 15;
    this.spread = 0.009;
    this.lastShot = 0;
    this.raycaster = new THREE.Raycaster();
    this.tracers = [];
    this.audio = null;
    this.onHit = null;
    this.createViewModel();
    this.raycaster.far = this.range;
  }

  applyWeapon(type) {
    const configs = {
      pistol:       { damage: 20,  mag: 15, rate: 300, range: 70,  spread: .009,  reload: 2000 },
      sniper:       { damage: 30,  mag: 10, rate: 700, range: 180, spread: .0015, reload: 3000 },
      shotgun:      { damage: 75,  mag: 2,  rate: 500, range: 22,  spread: .055,  reload: 3000 },
      revolver:     { damage: 25,  mag: 7,  rate: 400, range: 75,  spread: .007,  reload: 2000 },
      raygun:       { damage: 100, mag: 1,  rate: 0,   range: 75,  spread: .004,  reload: 4000 },
      death_sniper: { damage: 150, mag: 1,  rate: 0,   range: 260, spread: 0,     reload: 7500 }
    };
    const config = configs[type] || configs.pistol;
    this.weaponType = type;
    this.damage = config.damage;
    this.magSize = config.mag;
    this.fireRate = config.rate;
    this.range = config.range;
    this.spread = config.spread;
    this.raycaster.far = this.range;

    if (this.player) {
      if (this.player.reloadTimer) clearTimeout(this.player.reloadTimer);
      this.player.reloadTimer = null;
      this.player.weaponType = type;
      this.player.maxAmmo = config.mag;
      this.player.ammo = config.mag;
      this.player.reloadDuration = config.reload;
      this.player.reloading = false;
      if (this.player.onReloadCancel) this.player.onReloadCancel();
    }
    if (this.scoped) this.setScope(false);
    this.disposeViewModel();
    this.createViewModel();
  }

  makeMaterial(color, extra = {}) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
      ...extra
    });
  }

  makeGradientBodyGeometry(width, height, depth, topColor, bottomColor) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const positions = geometry.attributes.position;
    const top = new THREE.Color(topColor);
    const bottom = new THREE.Color(bottomColor);
    const colors = [];
    for (let i = 0; i < positions.count; i++) {
      const t = THREE.MathUtils.clamp((positions.getY(i) + height / 2) / height, 0, 1);
      const color = bottom.clone().lerp(top, t);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  addBox(parent, geometry, material, position, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }

  addLimb(parent, start, end, radius, material) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.82, radius, direction.length(), 10),
      material
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }

  createViewModel() {
    const type = this.weaponType;
    const isSniper = type === 'sniper' || type === 'death_sniper';
    const isShotgun = type === 'shotgun';
    const isRevolver = type === 'revolver';
    const isRaygun = type === 'raygun';
    const isDeath = type === 'death_sniper';

    const gun = new THREE.Group();
    gun.name = 'firstPersonWeapon';
    const bodyTop = isDeath ? 0xc58bff : isRaygun ? 0x9bffff : 0x91aec8;
    const bodyBottom = isDeath ? 0x301747 : isRaygun ? 0x12334c : 0x172838;
    const bodyGeometry = this.makeGradientBodyGeometry(.25, .17, .62, bodyTop, bodyBottom);
    const bodyMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: false, opacity: 1,
      depthTest: true, depthWrite: true, toneMapped: false
    });
    const darkMat = this.makeMaterial(0x0b1119);
    const steelMat = this.makeMaterial(isDeath ? 0x9270c9 : isRaygun ? 0x48eaff : 0x8295a6);
    const accentMat = this.makeMaterial(isDeath ? 0xd64cff : isRaygun ? 0x45ffff : 0x37aaff);
    const sleeveMat = this.makeMaterial(0x263b50);
    const gloveMat = this.makeMaterial(0x131a22);

    // Receiver dan popor.
    this.addBox(gun, bodyGeometry, bodyMat, [0, 0, -.06]);
    this.addBox(gun, new THREE.BoxGeometry(.20, .14, .34), darkMat, [0, -.015, .34]);
    this.addBox(gun, new THREE.BoxGeometry(.14, .25, .17), darkMat, [0, -.18, .12], [-.16, 0, 0]);
    this.addBox(gun, new THREE.BoxGeometry(.10, .10, .18), steelMat, [0, -.035, -.30]);
    const barrelLength = isSniper ? 1.38 : isShotgun ? .82 : isRevolver ? .48 : isRaygun ? .76 : .68;
    const barrelCenterZ = -.34 - barrelLength / 2;
    if (isShotgun) {
      for (const x of [-.065, .065]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.037, .045, barrelLength, 12), steelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(x, .025, barrelCenterZ);
          gun.add(barrel);
      }
      this.addBox(gun, new THREE.BoxGeometry(.28, .12, .28), darkMat, [0, -.085, -.55]);
    } else {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(isRaygun ? .075 : .032, isRaygun ? .095 : .043, barrelLength, 14),
        isRaygun ? accentMat : steelMat
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, .025, barrelCenterZ);
      gun.add(barrel);
    }

    // Detail berbeda untuk setiap kelas senjata.
    if (isSniper) {
      this.addBox(gun, new THREE.BoxGeometry(.16, .14, .46), darkMat, [0, .17, -.18]);
      this.addBox(gun, new THREE.BoxGeometry(.23, .10, .16), accentMat, [0, .23, -.18]);
      this.addBox(gun, new THREE.BoxGeometry(.09, .08, .18), steelMat, [0, .10, -.48]);
    } else if (isRevolver) {
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .20, 12), steelMat);
      cylinder.rotation.x = Math.PI / 2;
      cylinder.position.set(0, .005, -.12);
      gun.add(cylinder);
      this.addBox(gun, new THREE.BoxGeometry(.16, .035, .10), accentMat, [0, .105, -.17]);
    } else if (isRaygun) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.105, .025, 8, 18), steelMat);
      ring.position.set(0, .035, -.70);
      gun.add(ring);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 10), accentMat);
      orb.position.set(0, .035, -.70);
      gun.add(orb);
    } else {
      this.addBox(gun, new THREE.BoxGeometry(.13, .045, .30), steelMat, [0, .105, -.18]);
      this.addBox(gun, new THREE.BoxGeometry(.055, .08, .10), accentMat, [0, .17, -.20]);
    }

    // Magazine yang dapat dilepas saat reload. Revolver memakai silinder sebagai pengganti mag.
    let magazine = null;
    let spareMagazine = null;
    if (!isRevolver) {
      const magGeometry = new THREE.BoxGeometry(isShotgun ? .15 : .12, isShotgun ? .20 : .24, .15);
      magazine = this.addBox(gun, magGeometry, darkMat, [0, -.205, -.22], [.12, 0, 0]);
      spareMagazine = new THREE.Mesh(magGeometry, darkMat);
      spareMagazine.position.copy(magazine.position);
      spareMagazine.rotation.copy(magazine.rotation);
      spareMagazine.visible = false;
      spareMagazine.frustumCulled = false;
      gun.add(spareMagazine);
    }

    const bolt = this.addBox(gun, new THREE.BoxGeometry(.075, .045, .20), steelMat, [0, .095, -.10]);

    // Lengan dan sarung tangan first-person.
    const supportArm = new THREE.Group();
    supportArm.position.set(-.13, -.28, -.37);
    this.addLimb(supportArm, [-.11, -.13, -.12], [.04, .08, .20], .075, sleeveMat);
    const supportGlove = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), gloveMat);
    supportGlove.scale.set(1.15, .8, 1.2);
    supportGlove.position.set(.035, .075, .19);
    supportArm.add(supportGlove);
    gun.add(supportArm);

    const triggerArm = new THREE.Group();
    triggerArm.position.set(.19, -.29, .24);
    this.addLimb(triggerArm, [.12, -.16, .16], [-.015, .04, -.03], .085, sleeveMat);
    const triggerGlove = new THREE.Mesh(new THREE.SphereGeometry(.082, 10, 8), gloveMat);
    triggerGlove.scale.set(1.2, .85, 1.05);
    triggerGlove.position.set(-.005, .03, -.045);
    triggerArm.add(triggerGlove);
    gun.add(triggerArm);

    // Titik moncong dipakai sebagai sumber muzzle flash dan tracer.
    const muzzleZ = -.34 - barrelLength - .045;
    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.name = 'weaponMuzzle';
    muzzleAnchor.position.set(0, .025, muzzleZ);
    gun.add(muzzleAnchor);
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(isShotgun ? .052 : .044, .012, 7, 14), darkMat);
    muzzleAnchor.add(muzzleRing);

    const muzzleFlash = new THREE.Group();
    muzzleFlash.name = 'muzzleFlash';
    const flashCore = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), this.makeMaterial(0xfff1a1));
    flashCore.scale.set(1, 1, 1.7);
    muzzleFlash.add(flashCore);
    const flashCone = new THREE.Mesh(new THREE.ConeGeometry(.085, .28, 9), this.makeMaterial(0xff8a24));
    flashCone.rotation.x = -Math.PI / 2;
    flashCone.position.z = -.13;
    muzzleFlash.add(flashCone);
    muzzleFlash.visible = false;
    muzzleAnchor.add(muzzleFlash);
    const muzzleLight = new THREE.PointLight(0xffa34a, 0, 3.5);
    muzzleLight.visible = false;
    muzzleAnchor.add(muzzleLight);

    // Model berada di kanan bawah layar, menempel pada kamera.
    gun.position.set(.42, -.32, -.58);
    gun.rotation.set(-.045, -.055, 0);
    gun.scale.setScalar(1.12);
    gun.traverse(object => {
      if (object.isMesh) {
        object.frustumCulled = false;
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.transparent = false;
            material.opacity = 1;
            material.depthTest = true;
            material.depthWrite = true;
          }
        }
      }
    });
    this.camera.add(gun);
    this.viewModel = gun;
    this.muzzleAnchor = muzzleAnchor;
    this.animator = new WeaponAnimation(gun, { magazine, spareMagazine, bolt, supportArm, muzzleFlash, muzzleLight });
  }

  disposeViewModel() {
    if (!this.viewModel) return;
    this.camera.remove(this.viewModel);
    this.viewModel.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.viewModel = null;
    this.muzzleAnchor = null;
    this.animator = null;
  }

  startReloadAnimation(durationSeconds) {
    if (this.animator) this.animator.startReload(durationSeconds);
  }

  cancelReloadAnimation() {
    if (this.animator) this.animator.cancelReload();
  }

  setScope(active) {
    this.scoped = active;
    const scopedFov = this.weaponType === 'sniper' ? 22 : this.weaponType === 'shotgun' ? 58 : 42;
    this.camera.fov = active ? scopedFov : 75;
    this.camera.updateProjectionMatrix();
    if (this.viewModel) this.viewModel.visible = !active;
    if (this.onScope) this.onScope(active);
  }

  getMuzzleWorldPosition() {
    if (!this.muzzleAnchor) return this.camera.position.clone();
    this.camera.updateMatrixWorld(true);
    this.muzzleAnchor.updateWorldMatrix(true, false);
    return this.muzzleAnchor.getWorldPosition(new THREE.Vector3());
  }

  shoot(targets = []) {
    if (!this.player.alive || this.player.reloading || this.player.ammo <= 0) return null;
    const now = performance.now();
    if (now - this.lastShot < this.fireRate) return null;

    this.lastShot = now;
    this.player.ammo--;
    this.raycaster.setFromCamera(
      new THREE.Vector2((Math.random() - .5) * this.spread, (Math.random() - .5) * this.spread),
      this.camera
    );

    const meshes = targets.map(target => target.mesh).filter(Boolean);
    let hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length && !hasLineOfSight(this.raycaster.ray.origin, hits[0].point)) hits = [];

    this.playShotSound();
    if (this.animator) this.animator.triggerShot();

    // Visual tracer dimulai dari moncong senjata, bukan dari titik tengah layar.
    const start = this.getMuzzleWorldPosition();
    const end = hits.length > 0
      ? hits[0].point.clone()
      : start.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(this.range));
    this.createTracer(start, end);

    if (hits.length > 0) {
      const hit = hits[0];
      let target = null;
      let obj = hit.object;
      let headshot = false;
      while (obj) {
        if (obj.name === 'headHitbox') headshot = true;
        target = targets.find(item => item.mesh === obj) || target;
        obj = obj.parent;
      }
      if (target && target.alive) {
        const actualDamage = headshot ? this.damage * 2 : this.damage;
        const killed = target.damage(actualDamage, 'blue');
        if (this.onHit) this.onHit(target, actualDamage, killed, headshot);
        return target;
      }
    }
    return null;
  }

  createTracer(start, end) {
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < .001) return;
    const curve = new THREE.LineCurve3(start, end);
    const glowGeo = new THREE.TubeGeometry(curve, 1, .035, 5, false);
    const coreGeo = new THREE.TubeGeometry(curve, 1, .010, 5, false);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4b12, transparent: true, opacity: .8, depthWrite: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    this.scene.add(glow);
    const material = new THREE.MeshBasicMaterial({ color: 0xfff5b5, transparent: true, opacity: 1, depthWrite: false });
    const line = new THREE.Mesh(coreGeo, material);
    this.scene.add(line);
    this.tracers.push({ line, glow, life: .14, max: .14 });
  }

  playShotSound() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.audio ||= new Context();
      if (this.audio.state === 'suspended') this.audio.resume();
      const context = this.audio;
      const now = context.currentTime;
      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * .11), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      const gain = context.createGain();
      gain.gain.setValueAtTime(.78, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .11);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      noise.start(now);
      noise.stop(now + .11);
    } catch {}
  }

  update(dt) {
    if (this.animator) {
      const moving = Math.abs(this.player.moveForward) + Math.abs(this.player.moveRight) > .05;
      this.animator.update(dt, moving);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / tracer.max);
      tracer.glow.material.opacity = Math.max(0, tracer.life / tracer.max) * .7;
      if (tracer.life <= 0) {
        this.scene.remove(tracer.line);
        this.scene.remove(tracer.glow);
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        tracer.glow.geometry.dispose();
        tracer.glow.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
