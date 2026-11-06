import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createMap } from './Map.js';
import { Player } from './Player.js';
import { AI } from './AI.js';
import { Weapons } from './Weapons.js';
import { UI } from './UI.js';

let scene, camera, renderer, player, weapon, ui;
let bots = [];
let blueScore = 0, redScore = 0;
let playerKills = 0, playerDeaths = 0, gamePaused = false;
let matchTime = 300, gameRunning = false, firing = false, scoped = false;
let lastFrame = 0, playerRespawnTimer = 0;
let lobbyRenderer, lobbyScene, lobbyCamera, lobbyCharacter;
let selectedMap = 'city', selectedWeapon = 'pistol';
const entryScreen = document.getElementById('entryScreen');
const gameElement = document.getElementById('game');
const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const rotateNotice = document.getElementById('rotateNotice');

async function requestLandscape() {
  // Minta browser mengunci orientasi landscape setelah gesture Mulai + fullscreen.
  try { if (screen.orientation?.lock) await screen.orientation.lock('landscape'); } catch {}
}

function setupLobbyPreview() {
  const canvas = document.getElementById('lobbyPreview'); if (!canvas) return;
  lobbyRenderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true}); lobbyRenderer.setPixelRatio(Math.min(devicePixelRatio,2)); lobbyRenderer.setSize(canvas.clientWidth || 280, canvas.clientHeight || 320, false);
  lobbyScene = new THREE.Scene(); lobbyScene.background = null;
  lobbyCamera = new THREE.PerspectiveCamera(35, (canvas.clientWidth||280)/(canvas.clientHeight||320), 0.1, 30); lobbyCamera.position.set(0,2.2,7); lobbyCamera.lookAt(0,1.2,0);
  lobbyScene.add(new THREE.HemisphereLight(0xc5e4ff,0x263347,2)); const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,6,4);lobbyScene.add(light);
  lobbyCharacter = new THREE.Group();
  const blue=new THREE.MeshStandardMaterial({color:0x168cff,roughness:.55}), skin=new THREE.MeshStandardMaterial({color:0xc99b75}), dark=new THREE.MeshStandardMaterial({color:0x18212b});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.7,5,12),blue);torso.position.y=1.35;lobbyCharacter.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.24,16,12),skin);head.position.y=2.05;lobbyCharacter.add(head);
  for(const x of [-.18,.18]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.095,.55,4,8),dark);leg.position.set(x,.55,0);lobbyCharacter.add(leg);const boot=new THREE.Mesh(new THREE.BoxGeometry(.16,.12,.28),dark);boot.position.set(x,.16,-.07);lobbyCharacter.add(boot);}
  const rifle=new THREE.Mesh(new THREE.BoxGeometry(.12,.13,.8),dark);rifle.position.set(.42,1.45,-.3);rifle.rotation.x=-.08;lobbyCharacter.add(rifle);
  lobbyScene.add(lobbyCharacter);
}


// Dedicated weapon selection screen and Three.js preview
let weaponPreviewRenderer, weaponPreviewScene, weaponPreviewCamera, previewWeaponGroup;
const weaponCatalog=[
 {id:'pistol',name:'PISTOL',stats:'15 MAG · 20 DMG · 2s',kind:'pistol'},
 {id:'sniper',name:'SNIPER',stats:'10 MAG · 30 DMG · 3s',kind:'sniper'},
 {id:'shotgun',name:'SHOTGUN',stats:'2 MAG · 75 DMG · 3s',kind:'shotgun'},
 {id:'revolver',name:'REVOLVER',stats:'7 MAG · 25 DMG · 2s',kind:'revolver'},
 {id:'raygun',name:'RAYGUN',stats:'1 MAG · 100 DMG · 4s',kind:'raygun'},
 {id:'death_sniper',name:'DEATH SNIPER',stats:'1 MAG · 150 DMG · 7.5s',kind:'death'}
];
function makePreviewWeapon(kind){
 // Preview memakai builder model yang sama persis dengan viewmodel gameplay.
 const type = kind === 'death' ? 'death_sniper' : kind;
 const temp = new Weapons(weaponPreviewScene, weaponPreviewCamera, null);
 temp.applyWeapon(type);
 const model = temp.viewModel;
 weaponPreviewCamera.remove(model);
 temp.animator = null;
 model.position.set(0, 0, 0);
 model.rotation.set(0.12, -0.35, 0);
 model.scale.setScalar(1.65);
 model.traverse(o => { if(o.isMesh){o.frustumCulled=false; if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.transparent=false;m.opacity=1;});}}});
 return model;
}
function initWeaponScreen(){
 const canvas=document.getElementById('weaponPreviewCanvas');if(!canvas||weaponPreviewRenderer)return;
 weaponPreviewRenderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});weaponPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio,2));weaponPreviewRenderer.setSize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight,false);weaponPreviewRenderer.outputColorSpace=THREE.SRGBColorSpace;
 weaponPreviewScene=new THREE.Scene();weaponPreviewCamera=new THREE.PerspectiveCamera(34,Math.max(1,canvas.clientWidth)/Math.max(1,canvas.clientHeight),.1,100);weaponPreviewCamera.position.set(0,1.1,6.5);weaponPreviewCamera.lookAt(0,0,0);weaponPreviewScene.add(weaponPreviewCamera);
 weaponPreviewScene.add(new THREE.HemisphereLight(0xbfe5ff,0x142235,2.3));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,5);weaponPreviewScene.add(key);const rim=new THREE.PointLight(0x299dff,30,12);rim.position.set(-3,1,-2);weaponPreviewScene.add(rim);
 previewWeaponGroup=new THREE.Group();weaponPreviewScene.add(previewWeaponGroup);selectPreviewWeapon(selectedWeapon);renderWeaponPreview();
}
function selectPreviewWeapon(id){
 const item=weaponCatalog.find(w=>w.id===id)||weaponCatalog[0];selectedWeapon=id;
 document.getElementById('weaponPreviewName').textContent=item.name;document.getElementById('weaponPreviewStats').textContent=item.stats;
 document.querySelectorAll('.weapon-card').forEach(b=>b.classList.toggle('active',b.dataset.weapon===id));
 if(previewWeaponGroup){previewWeaponGroup.clear();previewWeaponGroup.add(makePreviewWeapon(item.kind));}
}
function renderWeaponPreview(){if(!weaponPreviewRenderer)return;requestAnimationFrame(renderWeaponPreview);if(previewWeaponGroup&&document.getElementById('weaponScreen').classList.contains('open'))previewWeaponGroup.rotation.y+=.004;weaponPreviewRenderer.render(weaponPreviewScene,weaponPreviewCamera);}
function openWeaponScreen(){const screen=document.getElementById('weaponScreen');screen.classList.add('open');screen.setAttribute('aria-hidden','false');initWeaponScreen();resizeWeaponPreview();}
function closeWeaponScreen(){const screen=document.getElementById('weaponScreen');screen.classList.remove('open');screen.setAttribute('aria-hidden','true');}
function resizeWeaponPreview(){if(!weaponPreviewRenderer)return;const c=document.getElementById('weaponPreviewCanvas'),w=c.clientWidth||innerWidth,h=c.clientHeight||innerHeight;weaponPreviewRenderer.setSize(w,h,false);weaponPreviewCamera.aspect=w/h;weaponPreviewCamera.updateProjectionMatrix();}
function setupWeaponScreen(){
 const list=document.getElementById('weaponList');list.innerHTML=weaponCatalog.map(w=>`<button class="weapon-card${w.id===selectedWeapon?' active':''}" data-weapon="${w.id}"><strong>${w.name}</strong><small>${w.stats}</small></button>`).join('');
 list.querySelectorAll('.weapon-card').forEach(b=>b.addEventListener('click',()=>selectPreviewWeapon(b.dataset.weapon)));
 document.getElementById('openWeaponsBtn').addEventListener('click',openWeaponScreen);document.getElementById('weaponBackBtn').addEventListener('click',closeWeaponScreen);
 document.getElementById('useWeaponBtn').addEventListener('click',()=>{weapon.applyWeapon(selectedWeapon);closeWeaponScreen();});
 addEventListener('resize',resizeWeaponPreview);
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8eb6d8);
  scene.fog = new THREE.Fog(0x8eb6d8, 100, 260);
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
  // Camera harus menjadi bagian scene agar child viewmodel (senjata first-person) ikut dirender.
  scene.add(camera);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  gameElement.appendChild(renderer.domElement);

  // Lobby 3D preview dihapus sesuai permintaan.
  createMap(scene);
  player = new Player(scene, camera);
  player.onDeath = attackerTeam => { awardKill(attackerTeam); playerDeaths++; playerRespawnTimer = 10; };
  player.onDamage = () => { player.damageFlash = 0.3; };
  weapon = new Weapons(scene, camera, player);
  player.onReloadStart = duration => weapon.startReloadAnimation(duration);
  player.onReloadComplete = () => weapon.cancelReloadAnimation();
  player.onReloadCancel = () => weapon.cancelReloadAnimation();
  function playKillSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=window.killAudio||(window.killAudio=new C());if(c.state==='suspended')c.resume();const n=c.currentTime;[[880,0],[1175,.09],[1568,.18]].forEach(([hz,t])=>{const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.setValueAtTime(hz,n+t);g.gain.setValueAtTime(.32,n+t);g.gain.exponentialRampToValueAtTime(.001,n+t+.22);o.connect(g);g.connect(c.destination);o.start(n+t);o.stop(n+t+.22);});}catch{}}
weapon.onHit = (target, amount, killed, headshot=false) => { showDamageNumber(target.position, amount, headshot); if (killed) { playerKills++; playKillSound(); showElimination(); } };
  weapon.onScope = active => { scoped = active; document.getElementById('scopeBtn').classList.toggle('active', active); document.getElementById('crosshair').classList.toggle('scoped', active); };
  createBots();
  ui = new UI(player, game);
  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);
  document.getElementById('enterBtn').addEventListener('click', enterLobby);
  document.getElementById('startBtn').addEventListener('click', startGame);
  setupWeaponScreen();
  document.getElementById('backLobbyBtn').addEventListener('click', backToLobby);
  document.getElementById('playAgainBtn').addEventListener('click', startGame);
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  // Pause overlay berada di dalam HUD yang pointer-events:none; paksa kontrol overlay menerima input.
  const pauseOverlay=document.getElementById('pauseOverlay'); pauseOverlay.style.pointerEvents='auto';
  document.querySelectorAll('#pauseOverlay button').forEach(btn=>{btn.style.pointerEvents='auto';btn.style.position='relative';btn.style.zIndex='2';});
  document.getElementById('resumeBtn').addEventListener('pointerup', e=>{e.preventDefault();e.stopPropagation();if(gamePaused)togglePause();});
  document.getElementById('pauseLobbyBtn').addEventListener('pointerup', e=>{e.preventDefault();e.stopPropagation();backToLobby();});
  document.getElementById('resumeBtn').addEventListener('click', e=>{e.preventDefault();if(gamePaused)togglePause();});
  document.getElementById('pauseLobbyBtn').addEventListener('click', e=>{e.preventDefault();backToLobby();});
  document.getElementById('mapSelect').addEventListener('change',e=>{selectedMap=e.target.value;});
  animate();
  updateOrientationNotice();
}

function createBots() {
  bots = [];
  for (let i = 1; i < 5; i++) bots.push(new AI(scene, 'blue', i));
  for (let i = 0; i < 5; i++) bots.push(new AI(scene, 'red', i));
  for (const bot of bots) bot.onDeath = attackerTeam => awardKill(attackerTeam);
}

function awardKill(team) {
  if (team === 'blue') blueScore++;
  else if (team === 'red') redScore++;
}

const game = {
  get bots() { return bots; },
  get blueScore() { return blueScore; },
  get redScore() { return redScore; },
  get playerRespawnTimer() { return playerRespawnTimer; },
  startFiring() { firing = true; },
  stopFiring() { firing = false; },
  toggleScope() { weapon.setScope(!weapon.scoped); },
  getTimeString() {
    const m = Math.floor(matchTime / 60), s = Math.floor(matchTime % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
};

async function enterLobby() {
  try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch {}
  await requestLandscape();
  entryScreen.style.display = 'none';
  menu.style.display = 'flex';
}

async function startGame() {
  await requestLandscape();
  createMap(scene, selectedMap);
  const mapLook = selectedMap==='forest' ? 0x729b70 : selectedMap==='desert' ? 0xd9b27b : 0x8eb6d8;
  scene.background = new THREE.Color(mapLook); scene.fog.color.set(mapLook);
  weapon.applyWeapon(selectedWeapon);
  menu.style.display = 'none';
  document.getElementById('matchResult').style.display='none';
  ['minimap','topRightHUD','status','health','ammo','controls','crosshair','damageOverlay','respawnOverlay','message','damageNumbers'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.visibility='';});
  hud.style.display = 'block';
  gameRunning = true;
  gamePaused = false; document.getElementById('pauseOverlay').style.display='none'; document.getElementById('pauseBtn').textContent='Ⅱ';
  firing = false;
  matchTime = 300;
  blueScore = redScore = 0; playerKills = playerDeaths = 0;
  playerRespawnTimer = 0;
  player.respawn();
  for (const bot of bots) bot.respawn();
  lastFrame = performance.now();
  updateOrientationNotice();
}

function endGame() {
  gameRunning = false;
  firing = false;
  // HUD tetap menjadi parent overlay hasil; gameplay controls disembunyikan, layar tetap landscape.
  hud.style.display = 'block';
  ['minimap','topRightHUD','status','health','ammo','controls','crosshair','damageOverlay','respawnOverlay','message','damageNumbers'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.visibility='hidden';});
  const resultBox = document.getElementById('matchResult'); resultBox.style.display = 'flex';
  const won = blueScore > redScore;
  document.getElementById('resultTitle').textContent = won ? 'BLUE TEAM MENANG!' : blueScore < redScore ? 'KALAH!' : 'HASIL SERI!';
  document.getElementById('resultTitle').className = won ? 'win' : blueScore < redScore ? 'lose' : 'draw';
  document.getElementById('resultScore').textContent = `BLUE ${blueScore} — ${redScore} RED`;
    const kicker=document.querySelector('.result-kicker'); if(kicker) kicker.textContent='MATCH SELESAI • SKOR AKHIR';
  // Jangan keluar fullscreen/orientasi saat hasil match muncul.
  requestLandscape();
}

async function backToLobby(){
  gameRunning=false; gamePaused=false; firing=false; hud.style.display='none'; document.getElementById('pauseOverlay').style.display='none';
  document.getElementById('matchResult').style.display='none';
  ['minimap','topRightHUD','status','health','ammo','controls','crosshair','damageOverlay','respawnOverlay','message','damageNumbers'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.visibility='';});
  menu.style.display='flex';
  try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}catch{}
  await requestLandscape();
}

function togglePause(){
  if(!gameRunning)return; gamePaused=!gamePaused; firing=false;
  document.getElementById('pauseOverlay').style.display=gamePaused?'flex':'none';
  document.getElementById('pauseBtn').textContent=gamePaused?'▶':'Ⅱ';
}

function update(dt) {
  if (!gameRunning || gamePaused) return;
  document.getElementById('kdaText').textContent=`K/D/A ${playerKills}/${playerDeaths}/0`;
  matchTime = Math.max(0, matchTime - dt);
  if (matchTime <= 0) { endGame(); return; }

  player.update(dt);
  if (!player.alive) {
    playerRespawnTimer -= dt;
    if (playerRespawnTimer <= 0) { playerRespawnTimer = 0; player.respawn(); }
  }

  for (const bot of bots) {
    const enemies = bots.filter(other => other.team !== bot.team);
    bot.update(dt, enemies, player);
  }

  if (firing && player.alive) weapon.shoot(bots.filter(bot => bot.team === 'red'));
  weapon.update(dt);
  ui.update(dt);
}

function showDamageNumber(worldPos, amount, headshot=false) {
  const pos = worldPos.clone(); pos.y += 2.5; pos.project(camera);
  const el = document.createElement('div'); el.className = 'damage-pop'+(headshot?' headshot':''); el.textContent = `${headshot?'HEADSHOT ':''}-${amount}`;
  el.style.left = `${(pos.x * .5 + .5) * innerWidth}px`; el.style.top = `${(-pos.y * .5 + .5) * innerHeight}px`;
  document.getElementById('damageNumbers').appendChild(el); setTimeout(() => el.remove(), 700);
}
function showElimination() {
  const msg = document.getElementById('message'); msg.textContent = '☠ ELIMINASI BERHASIL! +1 KILL'; msg.style.color = '#ffe45c';
  clearTimeout(showElimination.timer); showElimination.timer = setTimeout(() => { msg.textContent = ''; }, 1400);
}

function updateOrientationNotice() {
  if (!rotateNotice) return;
  rotateNotice.style.display = 'none';
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  update(dt);
  renderer.render(scene, camera);
}

function onResize() {

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  updateOrientationNotice();
}

init();
