
import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

import { checkCollision, BLUE_SPAWNS, RED_SPAWNS, hasLineOfSight } from './Map.js';

export class AI {
  constructor(scene, team, index) {
    this.scene = scene;
    this.team = team;
    this.index = index;

    this.hp = 100;
    this.maxHP = 100;

    this.speed = 5;
    this.weaponType = ['pistol','sniper','shotgun','revolver','raygun'][Math.floor(Math.random()*5)];
    const weaponStats={pistol:[20,15,300,42],sniper:[30,10,700,58],shotgun:[75,2,500,18],revolver:[25,7,400,44],raygun:[100,1,0,45]}[this.weaponType];
    this.damageAmount=team==='blue'?20:30; this.playerDamage=7; this.fireRate=weaponStats[2]; this.range=weaponStats[3];

    this.alive = true;
    this.respawnTimer = 0;
    this.onDeath = null;

    this.lastShot = 0;
    this.mag = weaponStats[1]; this.maxMag = weaponStats[1]; this.reloadTimer = 0;
    this.audioCtx = null; this.fx = []; this.listenerPosition = new THREE.Vector3();
    this.target = null;
    this.stuckTime = 0; this.lastMovePosition = new THREE.Vector3(); this.escapeSign = Math.random() < .5 ? -1 : 1;

    this.position = new THREE.Vector3();

    this.yaw = 0;

    this.createModel();
    this.respawn();
  }

  createModel() {
    this.mesh = new THREE.Group();

    const color = this.team === 'blue'
      ? 0x168cff
      : 0xff3333;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 1.25, 0.38),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6
      })
    );

    body.name = 'bodyHitbox';
    body.position.y = 1.25;
    body.castShadow = true;

    this.mesh.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xd8b18a
      })
    );

    head.name = 'headHitbox';
    head.position.y = 2.12;
    this.mesh.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.36,12,8),new THREE.MeshStandardMaterial({color:0x202027,roughness:.9}));
    hair.scale.set(1,.48,1); hair.position.set(0,2.34,-.025); this.mesh.add(hair);
    this.limbs = new THREE.Group(); this.mesh.add(this.limbs);
    const armMat = new THREE.MeshStandardMaterial({color:0x26384b});
    const skinMat = new THREE.MeshStandardMaterial({color:0xd8b18a});
    for (const side of [-1,1]) {
      const upper=new THREE.Mesh(new THREE.CapsuleGeometry(.09,.38,4,8),armMat);
      upper.position.set(side*.39,1.48,-.02); upper.rotation.z=side*.18; this.limbs.add(upper);
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),skinMat);
      hand.position.set(side*.42,1.22,-.2); this.limbs.add(hand);
    }
    this.walkPhase=0;

    // Model senjata AI dibuat berbeda sesuai loadout (bukan balok hitam polos).
    const gun = new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x344452,metalness:.65,roughness:.35});
    const trim=new THREE.MeshStandardMaterial({color:this.team==='blue'?0x299cff:0xff5148,metalness:.25});
    const part=(geo,mat,pos)=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);gun.add(m);};
    const isSniper=this.weaponType==='sniper',isShotgun=this.weaponType==='shotgun',isRevolver=this.weaponType==='revolver',isRaygun=this.weaponType==='raygun';
    let barrelMesh=null;
    if(isRaygun){part(new THREE.SphereGeometry(.16,10,8),trim,[0,.02,-.28]);barrelMesh=new THREE.Mesh(new THREE.CylinderGeometry(.09,.15,.55,10),metal);barrelMesh.position.set(0,0,-.42);gun.add(barrelMesh);}else{barrelMesh=new THREE.Mesh(new THREE.BoxGeometry(.16,.14,isSniper?1.05:isShotgun?.48:.58),metal);gun.add(barrelMesh);}
    part(new THREE.BoxGeometry(.12,.2,.14),metal,[0,-.15,.08]);
    if(!isRaygun){barrelMesh=new THREE.Mesh(new THREE.CylinderGeometry(isShotgun?.055:.028,isShotgun?.06:.032,isSniper?1.05:isRevolver?.3:.62,10),metal);barrelMesh.position.set(0,.015,isRevolver?-.38:-.52);gun.add(barrelMesh);}
    barrelMesh.rotation.x=Math.PI/2;
    part(new THREE.BoxGeometry(.1,.22,.12),metal,[0,-.2,-.05]);
    if(isSniper)part(new THREE.BoxGeometry(.12,.12,.2),trim,[0,.13,-.1]);
    if(!isRevolver)part(new THREE.BoxGeometry(.1,.2,.12),metal,[0,-.22,.12]);
    part(new THREE.BoxGeometry(.17,.035,.22),trim,[0,.09,-.08]);
    gun.position.set(.34,1.48,-.35);gun.rotation.x=-.04;this.mesh.add(gun);

    const pants = new THREE.MeshStandardMaterial({color:0x202b38});
    const boots = new THREE.MeshStandardMaterial({color:0x111419});
    this.legGroups=[];
    for (const x of [-0.16,0.16]) {
      const legGroup=new THREE.Group();legGroup.position.set(x,.78,0);this.mesh.add(legGroup);this.legGroups.push(legGroup);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.085,.55,4,8),pants); leg.position.set(0,-.28,0);legGroup.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.15,.12,.26),boots); foot.position.set(0,-.62,-.06);legGroup.add(foot);
    }

    this.mesh.userData.isAI = true;
    this.scene.add(this.mesh);
  }

  update(dt, enemies, player) {
    // FX harus tetap dibersihkan walau AI sudah mati agar tracer tidak membeku.
    this.updateShotFX(dt);
    if (!this.alive) {
      this.respawnTimer -= dt;

      if (this.respawnTimer <= 0) {
        this.respawn();
      }

      return;
    }

    this.playerRef = player || null;
    if (player?.position) this.listenerPosition.copy(player.position);
    if (this.reloadTimer > 0) { this.reloadTimer -= dt; if (this.reloadTimer <= 0) this.mag = this.maxMag; return; }
    this.findTarget(enemies, player);

    if (!this.target) return;

    this.moveTowardsTarget(dt);
    this.attackTarget();
  }

  findTarget(enemies, player) {
    let nearestBot = null;
    let nearestBotDistance = Infinity;
    for (const enemy of enemies) {
      if (!enemy || !enemy.alive || enemy.team === this.team) continue;
      const distance = this.position.distanceTo(enemy.position);
      if (distance < nearestBotDistance) { nearestBotDistance = distance; nearestBot = enemy; }
    }

    // Tim merah mengejar player sebagai target utama; bot lawan hanya dipilih
    // jika benar-benar lebih dekat daripada player. Tim biru tetap melawan bot merah.
    if (this.team === 'red' && player?.alive) {
      const playerDistance = this.position.distanceTo(player.position);
      this.target = nearestBot && nearestBotDistance < playerDistance ? nearestBot : player;
    } else {
      this.target = nearestBot;
    }
  }

  moveTowardsTarget(dt) {
    if (!this.target) return;
    const targetPosition = this.target.position;
    const base = new THREE.Vector3(targetPosition.x-this.position.x,0,targetPosition.z-this.position.z);
    const distance = base.length(); if(distance<0.001)return; base.normalize();
    // Jaga jarak tembak: jangan maju menempel target, mundur jika terlalu dekat.
    const preferredDistance = 7.5;
    const movementGoal = distance < preferredDistance ? base.clone().negate() : base.clone();
    this.yaw=Math.atan2(-base.x,-base.z);

    // Separation steering: AI menjaga jarak dengan kawan maupun lawan.
    const separation = new THREE.Vector3();
    for (const other of this.scene.children) {
      if (other===this.mesh || !other.userData?.isAI || !other.visible) continue;
      const dx=this.position.x-other.position.x, dz=this.position.z-other.position.z;
      const d=Math.hypot(dx,dz);
      if(d>0.001 && d<3.4){const force=(3.4-d)/2.4;separation.x+=(dx/d)*force;separation.z+=(dz/d)*force;}
    }
    if(separation.lengthSq()>0.001) separation.normalize().multiplyScalar(.95);
    const desired=movementGoal.add(separation).normalize();
    const angles=[0,10,-10,20,-20,35,-35,50,-50,70,-70,90,-90,110,-110,130,-130,150,-150,170,-170,180,45,-45];
    const step=this.speed*dt; let chosen=null,best=Infinity;
    for(const deg of angles){
      const dir=desired.clone().applyAxisAngle(new THREE.Vector3(0,1,0),deg*Math.PI/180);
      let blocked=false;
      // Multi ray probes around AI's shoulder width, not just center.
      for(const look of [0.7,1.25,1.9]){
        const px=this.position.x+dir.x*look,pz=this.position.z+dir.z*look;
        if(checkCollision(px,pz,.72)||checkCollision(px+dir.z*.48,pz-dir.x*.48,.48)||checkCollision(px-dir.z*.48,pz+dir.x*.48,.48)){blocked=true;break;}
      }
      if(blocked)continue;
      const nx=this.position.x+dir.x*step,nz=this.position.z+dir.z*step;
      // Hard personal-space check prevents AI from occupying the same spot.
      let tooClose=false;
      for(const other of this.scene.children){if(other===this.mesh||!other.userData?.isAI||!other.visible)continue;if(Math.hypot(nx-other.position.x,nz-other.position.z)<2.15){tooClose=true;break;}}
      if(tooClose)continue;
      const nextDistance=Math.hypot(targetPosition.x-nx,targetPosition.z-nz);
      const goal=Math.abs(nextDistance-preferredDistance) + (distance < preferredDistance ? Math.max(0,preferredDistance-nextDistance)*1.5 : Math.max(0,nextDistance-preferredDistance)*.35);
      const alignment=1-dir.dot(desired); const crowd=this.nearbyPenalty(nx,nz);
      const score=goal+alignment*2.3+crowd;
      if(score<best){best=score;chosen=dir;}
    }
    if(!chosen){
      // Rotate escape direction every failed attempt; try side/back + small random offset.
      this.escapeSign*=-1;
      const escapeAngles=[90*this.escapeSign,-90*this.escapeSign,135*this.escapeSign,180,45*this.escapeSign];
      for(const deg of escapeAngles){const d=desired.clone().applyAxisAngle(new THREE.Vector3(0,1,0),deg*Math.PI/180);if(!checkCollision(this.position.x+d.x*.9,this.position.z+d.z*.9,.7)){chosen=d;break;}}
    }
    if(chosen){
      const nx=this.position.x+chosen.x*step,nz=this.position.z+chosen.z*step;
      const oldX=this.position.x,oldZ=this.position.z;
      if(!checkCollision(nx,this.position.z,.7))this.position.x=nx;
      if(!checkCollision(this.position.x,nz,.7))this.position.z=nz;
      // If still blocked, back off and sidestep rather than endlessly pushing forward.
      if(Math.hypot(this.position.x-oldX,this.position.z-oldZ)<step*.18){
        this.stuckTime+=dt;
        const side=new THREE.Vector3(-desired.z,0,desired.x).multiplyScalar(this.escapeSign);
        for(const mul of [1.2,2,2.8]){const sx=oldX+side.x*step*mul,sz=oldZ+side.z*step*mul;if(!checkCollision(sx,sz,.7)){this.position.set(sx,0,sz);break;}}
      }else this.stuckTime=Math.max(0,this.stuckTime-dt*2);
      if(this.stuckTime>1.1){this.position.x-=desired.x*step*1.5;this.position.z-=desired.z*step*1.5;this.escapeSign*=-1;this.stuckTime=0;}
    }
    this.mesh.position.copy(this.position);this.mesh.rotation.y=this.yaw;
      this.walkPhase += dt*9;
      this.legGroups?.forEach((leg,i)=>leg.rotation.x=Math.sin(this.walkPhase+i*Math.PI)*.42);
      this.limbs.rotation.x=Math.sin(this.walkPhase)*.12;
  }
  nearbyPenalty(x,z){
    let penalty=0;for(const other of this.scene.children){if(other===this.mesh||!other.userData?.isAI)continue;const p=other.position;const d=Math.hypot(x-p.x,z-p.z);if(d<3.4)penalty+=(3.4-d)*4.2;}return penalty;
  }

  attackTarget() {
    if (!this.target || !this.target.alive) return;

    const distance = this.position.distanceTo(
      this.target.position
    );

    if (distance > this.range) return;
    // Damage hanya jika target berada di depan AI, bukan menembak ke segala arah.
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const toward = new THREE.Vector3(this.target.position.x-this.position.x, 0, this.target.position.z-this.position.z).normalize();
    if (forward.dot(toward) < 0.72) return;
    const from = this.position.clone(); from.y += 1.48;
    const to = this.target.position.clone();
    // Player.position adalah tinggi kamera (1.7m), jangan tambah offset kepala AI ke player.
    to.y = this.target === this.playerRef ? this.target.position.y : this.target.position.y + (0.18 + Math.random()*1.95);
    if (!hasLineOfSight(from, to)) return;

    const now = performance.now();

    if (now - this.lastShot < this.fireRate) return;
    if (this.mag <= 0) { this.reloadTimer = this.weaponType==='sniper'||this.weaponType==='shotgun'?3:2; this.playReloadSound(); return; }

    this.lastShot = now; this.mag--;
    this.createShotFX(this.target);

    // AKURASI AI
    const accuracy = 0.65;

    if (Math.random() > accuracy) return;

    // Dodge ditangani oleh target.damage(): kebal satu hit sesaat tanpa teleport.
    const headshot = Math.random() < 0.12;
    const baseDamage = this.target === this.playerRef ? this.playerDamage : this.damageAmount;
    this.target.damage(baseDamage * (headshot ? 2 : 1), this.team);
  }

  createShotFX(target) {
    // Titik asal tracer tepat di ujung laras senjata AI (koordinat lokal model).
    const muzzleLocal=new THREE.Vector3(.34,1.48,-.78);
    const from=this.mesh.localToWorld(muzzleLocal.clone());
    const to=target.position.clone();
    to.y=target===this.playerRef?target.position.y:target.position.y+(0.18+Math.random()*1.95);
    const geo=new THREE.BufferGeometry().setFromPoints([from,to]);
    const mat=new THREE.LineBasicMaterial({color:this.team==='blue'?0x65caff:0xff6b48,transparent:true,opacity:.9});
    const line=new THREE.Line(geo,mat);this.scene.add(line);this.fx.push({line,life:.11});
    // Kilatan kuning di ujung laras setiap AI menembak.
    const flash=new THREE.Mesh(new THREE.SphereGeometry(.105,8,6),new THREE.MeshBasicMaterial({color:0xffdf55,transparent:true,opacity:1}));flash.position.copy(from);this.scene.add(flash);
    const glow=new THREE.PointLight(0xffc52e,2.4,3);glow.position.copy(from);this.scene.add(glow);
    this.fx.push({line:flash,life:.075});this.fx.push({line:glow,life:.065});
    this.playShotSound();
  }
  updateShotFX(dt){for(let i=this.fx.length-1;i>=0;i--){const f=this.fx[i];f.life-=dt;if(f.line.material?.opacity!==undefined)f.line.material.opacity=Math.max(0,f.life/.11);if(f.life<=0){this.scene.remove(f.line);f.line.geometry?.dispose();f.line.material?.dispose();this.fx.splice(i,1);}}}
  playShotSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.audioCtx ||= new C();const c=this.audioCtx;if(c.state==='suspended')c.resume();const n=c.currentTime;const dist=this.position.distanceTo(this.listenerPosition);const volume=Math.max(.006,.22/(1+dist*.075));const pan=Math.max(-1,Math.min(1,(this.position.x-this.listenerPosition.x)/Math.max(8,dist)));const o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner?c.createStereoPanner():null;o.type='sawtooth';o.frequency.setValueAtTime(115,n);o.frequency.exponentialRampToValueAtTime(45,n+.09);g.gain.setValueAtTime(Math.min(.75,volume*3.2),n);g.gain.exponentialRampToValueAtTime(.001,n+.12);o.connect(g);if(p){p.pan.value=pan;g.connect(p);p.connect(c.destination);}else g.connect(c.destination);o.start(n);o.stop(n+.12);}catch{}}
  playReloadSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.audioCtx ||= new C();const c=this.audioCtx,n=c.currentTime;for(let i=0;i<2;i++){const o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.value=i?480:260;g.gain.setValueAtTime(.12,n+i*.18);g.gain.exponentialRampToValueAtTime(.001,n+i*.18+.08);o.connect(g);g.connect(c.destination);o.start(n+i*.18);o.stop(n+i*.18+.08);}}catch{}}

  damage(amount, attackerTeam = (this.team === 'blue' ? 'red' : 'blue')) {
    if (!this.alive) return false;
    this.lastDodged=false;
    if(Math.random()<.07){this.lastDodged=true;const el=document.createElement('div');el.className='damage-pop dodge-pop';el.textContent="Dodge";el.style.left=`${innerWidth*.5}px`;el.style.top=`${innerHeight*.42}px`;document.getElementById('damageNumbers')?.appendChild(el);setTimeout(()=>el.remove(),850);return false;}

    this.hp -= amount;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.respawnTimer = 10;
      if (this.onDeath) this.onDeath(attackerTeam);

      this.mesh.visible = false;

      return true;
    }

    return false;
  }

  respawn() {
    this.hp = this.maxHP;
    this.mag = this.maxMag; this.reloadTimer = 0;
    this.alive = true;
    this.target = null;

    const spawns = this.team === 'blue'
      ? BLUE_SPAWNS
      : RED_SPAWNS;

    const spawn = spawns[
      this.index % spawns.length
    ];

    this.position.set(
      spawn[0],
      0,
      spawn[2]
    );

    this.mesh.position.copy(this.position);
    this.mesh.visible = true;
  }
}
