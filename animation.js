import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/** Magazine-only reload animation for the first-person weapon. */
export class WeaponAnimation {
  constructor(viewModel, parts = {}) {
    this.viewModel = viewModel;
    this.parts = parts;
    this.basePosition = viewModel.position.clone();
    this.baseRotation = viewModel.rotation.clone();
    this.recoil = 0;
    this.flashTime = 0;
    this.reloading = false;
    this.reloadStartedAt = 0;
    this.reloadDurationMs = 0;
    this.magHome = parts.magazine ? parts.magazine.position.clone() : null;
    this.magRotationHome = parts.magazine ? parts.magazine.rotation.clone() : null;
    this.spareMagHome = parts.spareMagazine ? parts.spareMagazine.position.clone() : null;
    this.spareMagRotationHome = parts.spareMagazine ? parts.spareMagazine.rotation.clone() : null;
    this.supportArmHome = parts.supportArm ? parts.supportArm.rotation.clone() : null;
    this.supportArmPositionHome = parts.supportArm ? parts.supportArm.position.clone() : null;
    if (parts.spareMagazine) parts.spareMagazine.visible = false;
    if (parts.muzzleFlash) parts.muzzleFlash.visible = false;
    if (parts.muzzleLight) parts.muzzleLight.visible = false;
  }

  triggerShot() {
    this.recoil = Math.min(0.2, this.recoil + 0.105);
    this.flashTime = 0.075;
    if (this.parts.muzzleFlash) this.parts.muzzleFlash.visible = true;
    if (this.parts.muzzleLight) this.parts.muzzleLight.visible = true;
  }

  startReload(durationSeconds = 2) {
    if (this.reloading || !this.parts.magazine || !this.parts.spareMagazine) return;
    this.reloading = true;
    this.reloadStartedAt = performance.now();
    // Finish the magazine movement slightly before the ammo timer completes.
    this.reloadDurationMs = Math.max(350, durationSeconds * 1000 * 0.82);
    this.resetMagazine();
  }

  cancelReload() {
    this.reloading = false;
    this.reloadStartedAt = 0;
    this.resetMagazine();
  }

  resetMagazine() {
    if (this.parts.magazine && this.magHome) {
      this.parts.magazine.position.copy(this.magHome);
      this.parts.magazine.rotation.copy(this.magRotationHome);
      this.parts.magazine.visible = true;
    }
    if (this.parts.supportArm && this.supportArmHome) {
      this.parts.supportArm.rotation.copy(this.supportArmHome);
      this.parts.supportArm.position.copy(this.supportArmPositionHome);
    }
    if (this.parts.spareMagazine && this.spareMagHome) {
      this.parts.spareMagazine.position.copy(this.spareMagHome);
      this.parts.spareMagazine.rotation.copy(this.spareMagRotationHome);
      this.parts.spareMagazine.visible = false;
    }
  }

  update(dt) {
    const delta = Math.max(0, Math.min(dt, 0.05));
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 17, delta);
    this.viewModel.position.copy(this.basePosition);
    this.viewModel.position.z += this.recoil * 0.62;
    this.viewModel.rotation.copy(this.baseRotation);
    this.viewModel.rotation.x -= this.recoil * 0.62;

    this.flashTime = Math.max(0, this.flashTime - delta);
    if (this.parts.muzzleFlash) {
      this.parts.muzzleFlash.visible = this.flashTime > 0;
      if (this.flashTime > 0) this.parts.muzzleFlash.scale.setScalar(0.75 + (this.flashTime / 0.075) * 0.55);
    }
    if (this.parts.muzzleLight) {
      this.parts.muzzleLight.visible = this.flashTime > 0;
      this.parts.muzzleLight.intensity = this.flashTime > 0 ? 3.5 * (this.flashTime / 0.075) : 0;
    }

    if (!this.reloading) return;
    const elapsed = performance.now() - this.reloadStartedAt;
    const p = THREE.MathUtils.clamp(elapsed / this.reloadDurationMs, 0, 1);
    const magazine = this.parts.magazine;
    const spare = this.parts.spareMagazine;
    if (!magazine || !spare || !this.magHome || !this.spareMagHome) {
      this.cancelReload();
      return;
    }

    // Tangan penyangga ikut turun sedikit saat magazine dilepas, lalu kembali saat dipasang.
    if (this.parts.supportArm && this.supportArmHome) {
      const handMove = Math.sin(Math.PI * p);
      this.parts.supportArm.rotation.copy(this.supportArmHome);
      this.parts.supportArm.rotation.x += handMove * 0.42;
      this.parts.supportArm.rotation.z -= handMove * 0.16;
      this.parts.supportArm.position.copy(this.supportArmPositionHome);
      this.parts.supportArm.position.y -= handMove * 0.10;
    }
    const drop = THREE.MathUtils.smoothstep(p, 0.08, 0.34);
    const insert = THREE.MathUtils.smoothstep(p, 0.52, 0.84);
    if (p < 0.42) {
      magazine.visible = true;
      spare.visible = false;
      magazine.position.copy(this.magHome);
      magazine.position.y -= drop * 0.42;
      magazine.position.x -= drop * 0.025;
      magazine.rotation.copy(this.magRotationHome);
      magazine.rotation.x += drop * 0.18;
    } else {
      magazine.visible = false;
      spare.visible = true;
      spare.position.copy(this.spareMagHome);
      spare.position.y -= 0.42 * (1 - insert);
      spare.position.x -= 0.025 * (1 - insert);
      spare.rotation.copy(this.spareMagRotationHome);
      spare.rotation.x += (1 - insert) * 0.18;
    }

    if (p >= 1) {
      this.reloading = false;
      this.resetMagazine();
    }
  }
}
