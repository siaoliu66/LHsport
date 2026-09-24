<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import fallback from './data/catalog.json'
import { getBootstrap, appendWorkoutLog } from './services/workoutApi'
import './style.css'
import './sync.css'

const STORE_KEY='lhsport.v2', TOKEN_KEY='lhsport.accessToken'
let stored={}; try{stored=JSON.parse(localStorage.getItem(STORE_KEY)||localStorage.getItem('lhsport.v1')||'{}')}catch{}
const level=ref(['beginner','advanced'].includes(stored.level)?stored.level:'beginner')
const TRAINING_DAYS=['Push','Pull','Legs','GlutesCore']
const LEVEL_OPTIONS={beginner:'新手 · 約 40 分鐘',advanced:'非新手'}
const DAY_LABELS={Push:'推',Pull:'拉',Legs:'腿',GlutesCore:'臀＋核心'}
const day=ref(TRAINING_DAYS.includes(stored.day)?stored.day:'Push')
const view=ref('train'), logs=ref(Array.isArray(stored.logs)?stored.logs.map(x=>({...x,syncStatus:x.syncStatus||'pending'})):[])
const draft=ref(stored.draft||null), programs=ref(fallback.programs), guides=ref(fallback.guides), guide=ref(null)
const seconds=ref(0), running=ref(false), accessToken=ref(localStorage.getItem(TOKEN_KEY)||''), tokenInput=ref('')
const showAccess=ref(!accessToken.value), user=ref(stored.user||null), syncState=ref(accessToken.value?'idle':'locked'), syncMessage=ref('')
let timer
const exercises=computed(()=>programs.value[level.value]?.[day.value]||[])
const total=computed(()=>exercises.value.reduce((n,e)=>n+Number(e.sets||0),0))
const done=computed(()=>draft.value?.sets?.flat().filter(s=>s.done).length||0)
const pendingCount=computed(()=>logs.value.filter(l=>l.syncStatus!=='synced').length)
const visibleLevels=computed(()=>user.value?.userId==='user_1'?['advanced']:user.value?.userId==='user_2'?['beginner']:['beginner','advanced'])
const statusText=computed(()=>({idle:'連線中',syncing:'同步中…',synced:'已同步',pending:`待同步 ${pendingCount.value}`,offline:'離線使用',error:'同步失敗',locked:'尚未連線'}[syncState.value]))
const last=computed(()=>{const out={};for(const log of logs.value)for(const e of log.exercises||[])if(!out[e.id])out[e.id]=e.sets;return out})
const dayLabel=value=>DAY_LABELS[value]||value
const repsLabel=value=>{const text=String(value);if(/[秒步]/.test(text))return text;if(text.includes('／側'))return text.replace('／側',' 下／側');return `${text} 下`}
const assignedLevel=userId=>userId==='user_1'?'advanced':userId==='user_2'?'beginner':level.value

function makeDraft(){return {level:level.value,day:day.value,startedAt:new Date().toISOString(),sets:exercises.value.map(e=>Array.from({length:Number(e.sets)},()=>({weight:'',reps:'',done:false})))}}
function ensureDraft(){if(!draft.value||draft.value.level!==level.value||draft.value.day!==day.value||!Array.isArray(draft.value.sets)||draft.value.sets.length!==exercises.value.length||draft.value.sets.some((sets,i)=>!Array.isArray(sets)||sets.length!==Number(exercises.value[i]?.sets)))draft.value=makeDraft()}
ensureDraft()
const truthy=v=>v===true||v===1||String(v).toLowerCase()==='true'
const formatRest=v=>{const s=Number(v)||60;return s>=120&&s%60===0?`${s/60}分鐘`:`${s}秒`}
function applyRemoteCatalog(exerciseRows,programRows){
 const exRows=(exerciseRows||[]).filter(r=>truthy(r.active)),pRows=(programRows||[]).filter(r=>truthy(r.active));if(!exRows.length||!pRows.length)return false
 const exMap=new Map(exRows.map(r=>[String(r.exerciseId),r])),next={beginner:{Push:[],Pull:[],Legs:[],GlutesCore:[]},advanced:{Push:[],Pull:[],Legs:[],GlutesCore:[]}},nextGuides={}
 for(const r of exRows)nextGuides[String(r.exerciseId)]={name:r.name,start:r.start,action:r.action,breath:r.breath,mistakes:r.mistakes,cue:r.cue,muscles:r.muscles}
 for(const r of pRows.sort((a,b)=>Number(a.order)-Number(b.order))){const e=exMap.get(String(r.exerciseId));if(!e||!next[r.level]?.[r.day])continue;next[r.level][r.day].push({id:String(r.exerciseId),name:e.name,sets:Number(r.sets)||1,reps:String(r.reps),rest:formatRest(r.restSeconds),restSeconds:Number(r.restSeconds)||60,focus:r.focus||'',guide:String(r.exerciseId)})}
 programs.value=next;guides.value=nextGuides;ensureDraft();return true
}
function rowsToLogs(rows){
 const grouped=new Map()
 for(const r of rows||[]){const id=String(r.logId);if(!grouped.has(id))grouped.set(id,{id,date:r.createdAt,level:r.level,day:r.day,syncStatus:'synced',exercises:[],map:new Map()});const log=grouped.get(id),eid=String(r.exerciseId);if(!log.map.has(eid)){const e={id:eid,name:r.exerciseName,sets:[]};log.map.set(eid,e);log.exercises.push(e)}log.map.get(eid).sets.push({weight:r.weight,reps:r.reps,done:true,setIndex:Number(r.setIndex)})}
 return [...grouped.values()].map(l=>{for(const e of l.exercises)e.sets.sort((a,b)=>a.setIndex-b.setIndex);delete l.map;return l}).sort((a,b)=>new Date(b.date)-new Date(a.date))
}
function mergeLogs(remote){const ids=new Set(remote.map(l=>l.id));const local=logs.value.filter(l=>!ids.has(l.id)).map(l=>({...l,syncStatus:'pending'}));logs.value=[...local,...remote].sort((a,b)=>new Date(b.date)-new Date(a.date))}
async function uploadPending(){for(const log of logs.value.filter(l=>l.syncStatus!=='synced')){try{await appendWorkoutLog(accessToken.value,log);log.syncStatus='synced'}catch(error){syncState.value=navigator.onLine?'error':'offline';syncMessage.value=error.message;return false}}return true}
async function syncAll(){
 if(!accessToken.value||syncState.value==='syncing')return
 syncState.value='syncing';syncMessage.value=''
 try{const previousUserId=user.value?.userId;const result=await getBootstrap(accessToken.value);if(previousUserId&&previousUserId!==result.user.userId){logs.value=[];draft.value=null}user.value=result.user;level.value=assignedLevel(result.user.userId);applyRemoteCatalog(result.exercises,result.programs);ensureDraft();const ownRows=(result.workoutLogs||[]).filter(row=>String(row.userId)===String(result.user.userId));mergeLogs(rowsToLogs(ownRows));const ok=await uploadPending();if(ok)syncState.value='synced'}
 catch(error){syncState.value=navigator.onLine?'error':'offline';syncMessage.value=error.message;if(/使用碼/.test(error.message))showAccess.value=true}
}
async function connect(){const value=tokenInput.value.trim();if(value.length<12){syncMessage.value='使用碼至少需要 12 個字元';return}accessToken.value=value;syncState.value='idle';await syncAll();if(syncState.value==='synced'){localStorage.setItem(TOKEN_KEY,value);tokenInput.value='';showAccess.value=false}else accessToken.value=''}
function forgetAccess(){if(pendingCount.value&& !confirm(`目前有 ${pendingCount.value} 筆紀錄尚未同步，切換後這些本機紀錄會被清除。仍要切換嗎？`))return;localStorage.removeItem(TOKEN_KEY);accessToken.value='';user.value=null;logs.value=[];draft.value=makeDraft();tokenInput.value='';syncMessage.value='';syncState.value='locked';showAccess.value=true}
function choose(l,d){level.value=l;day.value=d;ensureDraft();seconds.value=0;running.value=false}
function rest(s){seconds.value=s;running.value=true}
async function finish(){const entries=exercises.value.map((e,i)=>({id:e.id,name:e.name,sets:draft.value.sets[i].filter(s=>s.done).map(s=>({...s}))})).filter(e=>e.sets.length);if(!entries.length)return;const log={id:crypto.randomUUID(),date:new Date().toISOString(),level:level.value,day:day.value,exercises:entries,syncStatus:'pending'};logs.value.unshift(log);draft.value=makeDraft();running.value=false;seconds.value=0;view.value='history';if(accessToken.value){syncState.value='pending';await uploadPending();if(!pendingCount.value)syncState.value='synced'}}
function reset(){if(confirm('清除本次未完成紀錄？'))draft.value=makeDraft()}
function removePending(id){if(confirm('刪除這筆尚未同步的紀錄？'))logs.value=logs.value.filter(l=>l.id!==id)}
const clock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
watch([level,day,draft,logs,user],()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify({level:level.value,day:day.value,draft:draft.value,logs:logs.value,user:user.value}))}catch{alert('儲存空間不足，請先保留訓練紀錄。')}},{deep:true})
onMounted(()=>{timer=setInterval(()=>{if(running.value&&seconds.value>0)seconds.value--;if(seconds.value===0)running.value=false},1000);window.addEventListener('online',syncAll);if(accessToken.value)syncAll()})
onUnmounted(()=>{clearInterval(timer);window.removeEventListener('online',syncAll)})
</script>

<template><main class="shell">
<header><div class="brand"><b>LH</b><span><strong>LH sport</strong><small>{{user?.name||'訓練紀錄'}}</small></span></div><button class="badge" :class="syncState" @click="accessToken?syncAll():showAccess=true">{{statusText}}</button></header>
<p v-if="syncMessage&&syncState==='error'" class="sync-error">{{syncMessage}} · 點右上角重試</p>
<nav><button :class="{active:view==='train'}" @click="view='train'">今日訓練</button><button :class="{active:view==='history'}" @click="view='history'">訓練歷史 · {{logs.length}}</button><button v-if="accessToken" @click="forgetAccess">切換使用者</button></nav>
<template v-if="view==='train'"><div class="heading"><div><small class="overline">TODAY'S SESSION</small><h1>{{dayLabel(day)}} <span>訓練</span></h1></div><div class="progress"><strong>{{done}}<span>/{{total}}</span></strong><small>已完成組數</small></div></div>
<div class="choices"><div class="switch"><button v-for="option in visibleLevels" :key="option" :class="{selected:level===option}" @click="choose(option,day)">{{LEVEL_OPTIONS[option]}}</button></div><div class="switch day-switch"><button v-for="d in TRAINING_DAYS" :key="d" :class="{selected:day===d}" @click="choose(level,d)">{{dayLabel(d)}}</button></div></div>
<p class="hint" v-if="level==='beginner'">熱身 5 分鐘 · 正式訓練約 30 分鐘 · 收操 5 分鐘</p><div class="timer"><div><small>組間休息</small><strong>{{clock(seconds)}}</strong></div><div><button @click="rest(60)">1 分鐘</button><button @click="rest(90)">1:30</button><button :disabled="!seconds" @click="running=!running">{{running?'暫停':'繼續'}}</button></div></div>
<section class="cards"><article v-for="(e,i) in exercises" :key="e.id" class="card"><div class="card-head"><span class="num">{{String(i+1).padStart(2,'0')}}</span><div class="title"><h2>{{e.name}}</h2><p>{{repsLabel(e.reps)}} · 休息 {{e.rest}} · {{e.focus}}</p></div><button class="guide" @click="guide=guides[e.guide]" :disabled="!guides[e.guide]">動作指引</button></div><p class="last" v-if="last[e.id]?.length">上次：{{last[e.id].map(s=>`${s.weight||'自重'} kg × ${s.reps||'—'}`).join('、')}}</p><div class="set-head"><span>組數</span><span>重量 kg</span><span>次數</span><span>完成</span></div><div v-for="(set,n) in draft.sets[i]" :key="n" class="set"><label>第 {{n+1}} 組</label><input type="number" inputmode="decimal" min="0" step="0.5" placeholder="kg" v-model="set.weight"><input type="number" inputmode="numeric" min="0" step="1" :placeholder="e.reps.includes('秒')?'秒':'下'" v-model="set.reps"><input type="checkbox" v-model="set.done" @change="set.done&&rest(e.restSeconds)"></div></article></section>
<div class="actions"><button class="plain" @click="reset">清空本次</button><button class="primary" :disabled="!done" @click="finish">完成訓練 · {{done}} 組</button></div></template>
<section v-else class="history"><div class="heading"><div><small class="overline">WORKOUT LOG</small><h1>訓練歷史</h1></div><button class="plain" @click="view='train'">返回訓練</button></div><p v-if="!logs.length" class="empty">還沒有完成的訓練。勾選組數後按「完成訓練」，紀錄就會出現在這裡。</p><article v-for="l in logs" :key="l.id" class="card"><div class="log-head"><div><small>{{new Date(l.date).toLocaleDateString('zh-TW')}} · {{l.level==='beginner'?'新手':'非新手'}} · <span :class="['log-status',l.syncStatus]">{{l.syncStatus==='synced'?'已同步':'等待同步'}}</span></small><h2>{{dayLabel(l.day)}} 訓練</h2></div><button v-if="l.syncStatus!=='synced'" class="plain" @click="removePending(l.id)">刪除</button></div><div v-for="e in l.exercises" :key="e.id" class="log-line"><b>{{e.name}}</b><span>{{e.sets.map(s=>`${s.weight||'自重'} kg × ${s.reps||'—'}`).join(' / ')}}</span></div></article></section>
<footer><span>未同步資料會保存在此瀏覽器，恢復網路後自動補傳。</span><button v-if="accessToken" class="plain" @click="forgetAccess">切換使用者</button></footer>
<div v-if="showAccess" class="overlay"><section class="modal access-modal" role="dialog" aria-modal="true"><small class="overline">PRIVATE ACCESS</small><h2>連接訓練紀錄</h2><p>第一次在這台裝置使用時，輸入你的個人使用碼。成功後會由瀏覽器記住。</p><label>個人使用碼<input v-model="tokenInput" type="password" autocomplete="current-password" placeholder="至少 12 個字元" @keyup.enter="connect"></label><p v-if="syncMessage" class="form-error">{{syncMessage}}</p><button class="primary" :disabled="syncState==='syncing'" @click="connect">{{syncState==='syncing'?'連接中…':'連接'}}</button><button v-if="accessToken" class="plain" @click="showAccess=false">取消</button></section></div>
<div v-if="guide" class="overlay" @click.self="guide=null"><section class="modal" role="dialog" aria-modal="true"><div class="log-head"><div><small>{{guide.muscles}}</small><h2>{{guide.name}}</h2></div><button class="plain" @click="guide=null">✕</button></div><dl><template v-for="[label,value] in [['起始姿勢',guide.start],['動作方式',guide.action],['呼吸',guide.breath],['常見錯誤',guide.mistakes],['新手口訣',guide.cue]]" :key="label"><dt>{{label}}</dt><dd>{{value}}</dd></template></dl><button class="primary" @click="guide=null">回到訓練</button></section></div>
</main></template>
