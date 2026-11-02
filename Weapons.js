
import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { hasLineOfSight } from './Map.js';

export class Weapons {
  constructor(scene, camera, player) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;

    this.weaponType = 'pistol';
    this.damage = 25; this.range = 100; this.fireRate = 180; this.magSize = 30; this.spread = 0.006;

    this.lastShot = 0;

    this.raycaster = new THREE.Raycaster();
    this.tracers = [];
    this.audio = null;
    this.onHit = null;
    this.createViewModel();

    this.raycaster.far = this.range;
  }

  applyWeapon(type) {
    const configs={pistol:{damage:25,mag:30,rate:230,range:100,spread:.006},sniper:{damage:50,mag:2,rate:900,range:180,spread:.001},shotgun:{damage:30,mag:5,rate:650,range:38,spread:.045}};
    const c=configs[type]||configs.pistol; this.weaponType=type;this.damage=c.damage;this.magSize=c.mag;this.fireRate=c.rate;this.range=c.range;this.spread=c.spread;
    if(this.player){this.player.weaponType=type;this.player.maxAmmo=c.mag;this.player.ammo=c.mag;this.player.reloading=false;}
    if(this.raycaster)this.raycaster.far=this.range;
    if(this.viewModel){this.camera.remove(this.viewModel);this.viewModel=null;} this.createViewModel();
  }

  createViewModel() {
    // First-person weapon model: high-contrast meshes, all attached to camera.
    const gun = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({color:0x202832});
    const black = new THREE.MeshBasicMaterial({color:0x0b1016});
    const steel = new THREE.MeshBasicMaterial({color:0x687785});
    const accent = new THREE.MeshBasicMaterial({color:0x3ca7e8});
    const addBox=(geo,mat,pos,rot)=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(rot)m.rotation.set(...rot);m.frustumCulled=false;gun.add(m);return m;};
    const sniper=this.weaponType==='sniper', shotgun=this.weaponType==='shotgun';
    // Receiver, stock, fore-end and grip
    addBox(new THREE.BoxGeometry(.19,.16,sniper?1.02:.58),dark,[0,0,sniper?-.35:-.16]);
    addBox(new THREE.BoxGeometry(.14,.12,.42),black,[0,-.035,.32]);
    addBox(new THREE.BoxGeometry(.13,.2,.15),black,[0,-.16,-.06],[-.18,0,0]);
    addBox(new THREE.BoxGeometry(.14,.14,.32),dark,[0,-.12,-.38]);
    // Long, clearly visible barrel and muzzle
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(shotgun?.055:.035,shotgun?.06:.04,sniper?1.15:.62,12),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.02,-.72);gun.add(barrel);
    const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.12,12),black);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.02,-1.27);gun.add(muzzle);
    // Magazine, rail, optic, sights, trigger and bolt
    addBox(new THREE.BoxGeometry(.11,.24,.14),black,[0,-.22,-.15],[.18,0,0]);
    addBox(new THREE.BoxGeometry(.13,.045,.35),steel,[0,.105,-.28]);
    addBox(new THREE.BoxGeometry(.095,.12,.16),black,[0,.18,-.27]);
    addBox(new THREE.BoxGeometry(.055,.035,.08),accent,[0,.245,-.27]);
    addBox(new THREE.BoxGeometry(.045,.05,.09),steel,[.11,.02,-.15]);
    addBox(new THREE.BoxGeometry(.045,.06,.07),steel,[0,-.12,.04]);
    // First-person forearm + gloved hand behind the grip: silhouette that reads as holding the gun.
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.105,.14,.48,10), new THREE.MeshBasicMaterial({color:0x263b50}));
    sleeve.rotation.z=-.72; sleeve.position.set(.22,-.27,.18); gun.add(sleeve);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(.105,10,8), new THREE.MeshBasicMaterial({color:0x171d23}));
    glove.scale.set(1.25,.8,1.15); glove.position.set(.08,-.13,-.12); gun.add(glove);
    const supportSleeve = new THREE.Mesh(new THREE.CylinderGeometry(.075,.11,.36,10), new THREE.MeshBasicMaterial({color:0x263b50}));
    supportSleeve.rotation.z=.62; supportSleeve.position.set(-.17,-.32,-.42); gun.add(supportSleeve);
    const supportHand = new THREE.Mesh(new THREE.SphereGeometry(.085,10,8), new THREE.MeshBasicMaterial({color:0x171d23}));
    supportHand.position.set(-.12,-.22,-.53); gun.add(supportHand);
    // Gun occupies the lower-right quarter, not outside camera view
    gun.position.set(.48,-.34,-.72); gun.rotation.set(-.06,-.08,0); gun.scale.set(1.9,1.9,1.9);
    // Outline-ish accents make the first-person gun easy to see on bright maps.
    addBox(new THREE.BoxGeometry(.205,.175,sniper?1.05:.62),accent,[0,.012,sniper?-.35:-.16]);
    addBox(new THREE.BoxGeometry(.18,.15,sniper?1.02:.58),dark,[0,0,sniper?-.35:-.16]);
    gun.renderOrder=999; gun.traverse(o=>{if(o.isMesh){o.renderOrder=999;o.frustumCulled=false;}});
    this.camera.add(gun); this.viewModel=gun; this.magazineMesh=null;
  }

  setScope(active) {
    this.scoped = active;
    const scopedFov = this.weaponType === 'sniper' ? 22 : this.weaponType === 'shotgun' ? 58 : 42;
    this.camera.fov = active ? scopedFov : 75;
    this.camera.updateProjectionMatrix();
    if (this.viewModel) this.viewModel.visible = !active;
    if (this.onScope) this.onScope(active);
  }

  shoot(targets = []) {
    if (!this.player.alive) return null;

    if (
      this.player.reloading ||
      this.player.ammo <= 0
    ) return null;

    const now = performance.now();

    if (now - this.lastShot < this.fireRate) {
      return null;
    }

    this.lastShot = now;
    this.player.ammo--;

    this.raycaster.setFromCamera(
      new THREE.Vector2((Math.random()-.5)*this.spread,(Math.random()-.5)*this.spread),
      this.camera
    );

    const meshes = targets.map(
      target => target.mesh
    ).filter(Boolean);

    let hits = this.raycaster.intersectObjects(meshes, true);
    // Cegah peluru menembus obstacle hanya sampai titik target yang benar-benar kena.
    if (hits.length && !hasLineOfSight(this.raycaster.ray.origin, hits[0].point)) hits = [];
    this.playShotSound();

    const start = this.camera.position.clone().add(new THREE.Vector3(0.22, -0.18, -0.42).applyQuaternion(this.camera.quaternion));
    const end = hits.length > 0 ? hits[0].point.clone() : start.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(this.range));
    this.createTracer(start, end);

    if (hits.length > 0) {
      const hit = hits[0];
      // Cari AI dari ancestor mesh, karena body/head berada beberapa tingkat di dalam Group.
      let target = null, obj = hit.object, headshot = false;
      while (obj) {
        if (obj.name === 'headHitbox') headshot = true;
        target = targets.find(t => t.mesh === obj) || target;
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
    if (direction.lengthSq() < 0.001) return;
    const curve = new THREE.LineCurve3(start, end);
    const glowGeo = new THREE.TubeGeometry(curve, 1, 0.095, 6, false);
    const coreGeo = new THREE.TubeGeometry(curve, 1, 0.035, 5, false);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4b12, transparent: true, opacity: 0.8, depthWrite:false });
    const glow = new THREE.Mesh(glowGeo, glowMat); this.scene.add(glow);
    const material = new THREE.MeshBasicMaterial({ color: 0xfff5b5, transparent: true, opacity: 1, depthWrite:false });
    const line = new THREE.Mesh(coreGeo, material); this.scene.add(line);
    this.tracers.push({ line, glow, life: 0.14, max: 0.14 });
  }

  playShotSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      this.audio ||= new Ctx(); if (this.audio.state === 'suspended') this.audio.resume();
      const ctx = this.audio, now = ctx.currentTime;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.11), ctx.sampleRate);
      const data = buffer.getChannelData(0); for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
      const noise=ctx.createBufferSource(); noise.buffer=buffer; const filter=ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=1500;
      const gain=ctx.createGain(); gain.gain.setValueAtTime(0.32,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.11);
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noise.start(now); noise.stop(now+0.11);
    } catch {}
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt; t.line.material.opacity = Math.max(0, t.life / t.max); t.glow.material.opacity = Math.max(0, t.life / t.max) * 0.7;
      if (t.life <= 0) { this.scene.remove(t.line); this.scene.remove(t.glow); t.line.geometry.dispose(); t.line.material.dispose(); t.glow.geometry.dispose(); t.glow.material.dispose(); this.tracers.splice(i, 1); }
    }
  }
}
