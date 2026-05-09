import React, { useState, useEffect, useRef } from 'react';
import { Howl, Howler } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'bgm2', name: '音軌 II：深海脈動', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0); 
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  const bgmRef = useRef(null);
  const voiceRef = useRef(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminClickCount, setAdminClickCount] = useState(0); // 記錄點擊次數
  const [dbStatus, setDbStatus] = useState('連線中...');
  
  const [scenarios, setScenarios] = useState([]); 
  const [availableDecks, setAvailableDecks] = useState([]); 
  
  const [activeScenario, setActiveScenario] = useState('');
  const [activeDeckType, setActiveDeckType] = useState('');
  
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadingFile, setCurrentUploadingFile] = useState('');

  // 初始化讀取劇本
  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功');
        await fetchScenarios();
      } catch (error) {
        setDbStatus('連線失敗');
      }
    };
    initApp();
  }, []);

  const fetchScenarios = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      const scenarioSet = new Set();
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.scenario) scenarioSet.add(data.scenario);
      });
      const sList = Array.from(scenarioSet).sort();
      setScenarios(sList);
      if (sList.length > 0 && !activeScenario) setActiveScenario(sList[0]);
    } catch (e) { console.error(e); }
  };

  // 管理員觸發邏輯：點擊五下
  const handleAdminTrigger = () => {
    const newCount = adminClickCount + 1;
    if (newCount >= 5) {
      const p = prompt("請輸入管理員密語：");
      if (p === '0943') {
        setIsAdmin(!isAdmin);
      }
      setAdminClickCount(0); // 重置次數
    } else {
      setAdminClickCount(newCount);
      // 3秒後沒繼續點擊則重置
      setTimeout(() => setAdminClickCount(0), 3000);
    }
  };

  useEffect(() => {
    if (activeScenario) fetchDecksForScenario(activeScenario);
  }, [activeScenario]);

  const fetchDecksForScenario = async (scenarioName) => {
    try {
      const q = query(collection(db, "cards"), where("scenario", "==", scenarioName));
      const snap = await getDocs(q);
      const deckSet = new Set();
      snap.forEach(d => {
        const data = d.data();
        if (data.deckType) deckSet.add(data.deckType);
      });
      const dList = Array.from(deckSet).sort();
      setAvailableDecks(dList);
      if (dList.length > 0) setActiveDeckType(dList[0]);
      else setActiveDeckType('');
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeScenario && activeDeckType) fetchFilteredCards();
  }, [activeScenario, activeDeckType]);

  const fetchFilteredCards = async () => {
    setIsSearching(true);
    try {
      const q = query(collection(db, "cards"), where("scenario", "==", activeScenario), where("deckType", "==", activeDeckType));
      const snap = await getDocs(q);
      const items = [];
      snap.forEach(d => items.push(d.data()));
      setCardList(items.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true})));
    } finally { setIsSearching(false); }
  };

  const initBgm = () => {
    if (bgmRef.current) { bgmRef.current.stop(); bgmRef.current.unload(); }
    bgmRef.current = new Howl({ src: [activeBgm.src], loop: true, volume: bgmVolume, html5: true });
    bgmRef.current.play();
  };

  useEffect(() => {
    if (isUnlocked) initBgm();
  }, [activeBgm, isUnlocked]);

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume(bgmVolume);
  }, [bgmVolume]);

  const startRitual = () => {
    setIsUnlocked(true);
    Howler.unload();
    initBgm();
  };

  const playVoice = (url) => {
    if (!isUnlocked || !url) return;
    if (voiceRef.current) voiceRef.current.unload();
    setIsVoicePlaying(true);
    voiceRef.current = new Howl({
      src: [url],
      html5: true, 
      format: ['mp3', 'wav', 'm4a', 'aac'],
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: () => setIsVoicePlaying(false)
    });
    voiceRef.current.play();
  };

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploadStatus('正在初始化');
    let uploadedCount = 0;
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
    const totalFiles = audioFiles.length;

    for (let file of audioFiles) {
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未命名劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類檔案";
      setCurrentUploadingFile(cardId);
      setUploadStatus(`同步檔案中`);
      try {
        const storageRef = ref(storage, `audios/${scen}/${deck}/${file.name}`);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await setDoc(doc(db, "cards", cardId), {
          id: cardId, scenario: scen, deckType: deck, audioUrl: downloadURL, uploadedAt: new Date().toISOString()
        });
        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / totalFiles) * 100));
      } catch (error) { console.error(error); }
    }
    setUploadStatus("同步完成");
    setCurrentUploadingFile('');
    await fetchScenarios();
    if (activeScenario) await fetchDecksForScenario(activeScenario);
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 5000);
  };

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#0a0a0a] text-[#c9b99a] font-serif selection:bg-[#ffb74d] selection:text-black">
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')]"></div>
      <div className="fixed inset-0 pointer-events-none z-[9998] shadow-[inset_0_0_200px_rgba(0,0,0,0.9)]"></div>

      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="relative p-20 border border-[#222] bg-[#050505]">
            <h1 className="text-6xl font-black text-[#ffb74d] mb-12 tracking-[1.2em]">禁忌檔案庫</h1>
            <button onClick={startRitual} className="px-20 py-8 border-2 border-[#ffb74d] text-[#ffb74d] text-2xl font-bold hover:bg-[#ffb74d] hover:text-black transition-all duration-700 tracking-[0.8em] uppercase">Initiate</button>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center px-10 py-6 border-b border-[#1a1a1a] bg-[#050505] z-20">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 border border-[#ffb74d]/40 flex items-center justify-center text-lg rotate-45 text-[#ffb74d]">👁️</div>
          <div className="text-3xl font-bold text-[#ffb74d] cursor-pointer tracking-widest" onClick={handleAdminTrigger}>
            禁忌檔案庫 {isAdmin && <span className="text-xs ml-3 text-red-500 animate-pulse uppercase">[管理模式]</span>}
          </div>
        </div>
        <div className="flex items-center space-x-8">
          <div className="flex items-center gap-4 px-6 py-3 border border-[#1a1a1a] bg-black text-[11px]">
            <span className="opacity-30 text-[#ffb74d] uppercase tracking-widest">BGM System</span>
            <select className="bg-transparent outline-none text-[#ffb74d] font-bold" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-[#050505]">{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-32 h-1 accent-[#ffb74d]" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-10 gap-10 overflow-hidden relative">
        <div className="w-72 flex flex-col gap-10 overflow-y-auto pr-4 custom-scrollbar">
          <section>
            <p className="text-[#ffb74d] text-[10px] mb-6 opacity-40 uppercase tracking-[0.4em] font-black border-l-4 border-[#ffb74d] pl-4">劇本清單</p>
            <div className="flex flex-col gap-3">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`p-5 text-sm text-left border transition-all duration-500 ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold shadow-[0_5px_20px_rgba(255,183,77,0.3)]' : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#ffb74d]/60'}`}>{s}</button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[#ffb74d] text-[10px] mb-6 opacity-40 uppercase tracking-[0.4em] font-black border-l-4 border-[#ffb74d] pl-4">檔案分類</p>
            <div className="flex flex-col gap-3">
              {availableDecks.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-5 text-xs text-left border transition-all duration-500 ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] bg-[#ffb74d]/5 font-bold shadow-[inset_0_0_20px_rgba(255,183,77,0.1)]' : 'border-[#1a1a1a] bg-[#0a0a0a] opacity-50 hover:opacity-100 hover:border-[#ffb74d]/40'}`}>{d}</button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-8 overflow-hidden">
          <div className="flex gap-5">
            <input type="text" placeholder="輸入編號進行深度檢索..." className="flex-1 p-6 bg-[#050505] border border-[#1a1a1a] text-2xl outline-none focus:border-[#ffb74d]" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("此紀錄未被編錄。");
                });
              }
            }} className="px-16 bg-[#ffb74d] text-black font-black uppercase shadow-[0_0_30px_rgba(255,183,77,0.2)]">檢索</button>
          </div>

          <div className="flex-1 border border-[#1a1a1a] p-12 flex flex-col items-center justify-center relative bg-[#050505] shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
            {isAdmin ? (
              <div className="w-full max-w-2xl text-center animate-fadeIn">
                <div className="relative border-2 border-dashed border-[#ffb74d]/20 p-24 bg-[#080808] cursor-pointer">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="flex flex-col items-center gap-8">
                    <div className="text-8xl opacity-40">📂</div>
                    <p className="text-3xl font-bold tracking-[0.3em] text-[#ffb74d]">{uploadStatus || "上傳音檔資料夾"}</p>
                    {currentUploadingFile && <p className="text-[10px] font-mono text-[#ffb74d] animate-pulse">Processing: {currentUploadingFile}</p>}
                  </div>
                  {uploadProgress > 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-black/50">
                      <div className="h-full bg-[#ffb74d] transition-all duration-500" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  )}
                </div>
                <button onClick={() => setIsAdmin(false)} className="mt-16 text-[9px] opacity-20 hover:opacity-100 hover:text-[#ffb74d] transition-all tracking-[0.6em] uppercase">關閉管理模式</button>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full animate-fadeIn flex flex-col items-center">
                <div className="mb-6 flex items-center gap-8 opacity-30">
                  <div className="h-[1px] w-24 bg-[#ffb74d]"></div>
                  <span className="text-xs tracking-[1em] font-black uppercase">{currentCard.scenario} / {currentCard.deckType}</span>
                  <div className="h-[1px] w-24 bg-[#ffb74d]"></div>
                </div>
                <h2 className="text-[14rem] font-black leading-none my-14 tracking-tighter text-[#ffb74d] drop-shadow-[0_10px_40px_rgba(255,183,77,0.4)]">{currentCard.id}</h2>
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`group relative w-48 h-48 rounded-full border-4 flex items-center justify-center transition-all duration-1000 ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/5' : 'border-[#c9b99a]/10 hover:border-[#ffb74d]'}`}>
                  <div className="text-7xl">{isVoicePlaying ? '⚡' : '▶'}</div>
                </button>
                <button onClick={() => setCurrentCard(null)} className="mt-20 px-14 py-4 border border-[#1a1a1a] text-[10px] opacity-20 hover:opacity-100 tracking-[0.5em] uppercase font-black">Dismiss</button>
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto custom-scrollbar pr-4">
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                  {cardList.map(card => (
                    <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="aspect-[4/5] border border-[#1a1a1a] bg-[#080808] flex flex-col items-center justify-center p-6 group hover:border-[#ffb74d] hover:-translate-y-3 transition-all duration-700">
                      <span className="text-4xl font-black group-hover:text-[#ffb74d] transition-all duration-700">{card.id}</span>
                      <div className="mt-6 text-[8px] opacity-10 group-hover:opacity-100 transition-all tracking-[0.4em] uppercase font-black">Inspect</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ffb74d; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 1s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
      `}</style>
    </div>
  );
}
