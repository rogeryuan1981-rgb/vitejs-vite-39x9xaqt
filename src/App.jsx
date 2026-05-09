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
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0); 
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  const bgmRef = useRef(null);
  const voiceRef = useRef(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminClickCount, setAdminClickCount] = useState(0);
  
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

  // 初始化資料庫連線
  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        await fetchScenarios();
      } catch (error) {
        console.error("Database connection failed");
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

  // 管理員觸發機制：五連擊
  const handleAdminTrigger = () => {
    const newCount = adminClickCount + 1;
    if (newCount >= 5) {
      const p = prompt("請輸入密語：");
      if (p === '0943') setIsAdmin(!isAdmin);
      setAdminClickCount(0);
    } else {
      setAdminClickCount(newCount);
      setTimeout(() => setAdminClickCount(0), 2000);
    }
  };

  // 劇本連動停止音訊
  useEffect(() => {
    if (activeScenario) {
      if (voiceRef.current) voiceRef.current.stop();
      fetchDecksForScenario(activeScenario);
    }
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

  useEffect(() => { if (isUnlocked) initBgm(); }, [activeBgm, isUnlocked]);
  useEffect(() => { if (bgmRef.current) bgmRef.current.volume(bgmVolume); }, [bgmVolume]);

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

  const dismissCard = () => {
    if (voiceRef.current) voiceRef.current.stop();
    setCurrentCard(null);
  };

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploadStatus('同步中');
    let uploadedCount = 0;
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
    const totalFiles = audioFiles.length;

    for (let file of audioFiles) {
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未命名劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類檔案";
      setCurrentUploadingFile(cardId);
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
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 3000);
  };

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#0a0a0a] text-[#c9b99a] font-sans selection:bg-[#ffb74d] selection:text-black">
      {/* 全域暗角與噪點 */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.05] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')]"></div>
      <div className="fixed inset-0 pointer-events-none z-[9998] shadow-[inset_0_0_150px_rgba(0,0,0,0.9)]"></div>

      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-10 text-center">
          <div className="relative p-24 border border-[#222] bg-[#050505] shadow-[0_0_100px_rgba(0,0,0,0.8)]">
            <h1 className="text-6xl md:text-8xl font-bold text-[#ffb74d] mb-16 tracking-[1.2em] drop-shadow-[0_0_30px_rgba(255,183,77,0.3)]">禁忌檔案庫</h1>
            <button onClick={startRitual} className="px-24 py-10 border-2 border-[#ffb74d] text-[#ffb74d] text-3xl font-bold hover:bg-[#ffb74d] hover:text-black transition-all duration-700 tracking-[0.8em]">INITIATE</button>
          </div>
        </div>
      )}

      {/* Header - iPad 優化高度與間距 */}
      <header className="flex-none flex justify-between items-center px-12 py-10 border-b border-[#1a1a1a] bg-[#050505] z-20">
        <div className="flex items-center gap-10">
          <div className="w-16 h-16 border border-[#ffb74d]/40 flex items-center justify-center text-3xl rotate-45 text-[#ffb74d] shadow-[0_0_20px_rgba(255,183,77,0.1)]">👁️</div>
          <div className="text-4xl md:text-5xl font-bold text-[#ffb74d] cursor-pointer tracking-widest hover:brightness-125 transition-all" onClick={handleAdminTrigger}>
            禁忌檔案庫 {isAdmin && <span className="text-sm ml-4 text-red-500 animate-pulse">[管理模式]</span>}
          </div>
        </div>
        <div className="flex items-center space-x-12">
          <div className="flex items-center gap-8 px-10 py-5 border border-[#1a1a1a] bg-black/50 text-sm">
            <span className="opacity-30 text-[#ffb74d] uppercase tracking-[0.3em] font-bold">BGM System</span>
            <select className="bg-transparent outline-none text-[#ffb74d] font-bold" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-[#050505]">{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-48 h-1 accent-[#ffb74d] cursor-pointer" />
          </div>
        </div>
      </header>

      {/* Main Layout - 修正 iPad 比例 */}
      <main className="flex-1 flex p-12 gap-12 overflow-hidden relative min-h-0">
        {/* 左側選單 - 獨立滾動且寬度自動適應 */}
        <div className="w-72 md:w-80 lg:w-96 flex flex-col gap-12 overflow-y-auto pr-6 custom-scrollbar flex-none">
          <section>
            <p className="text-[#ffb74d] text-xs mb-8 opacity-40 uppercase tracking-[0.5em] font-bold border-l-4 border-[#ffb74d] pl-6">劇本清單</p>
            <div className="flex flex-col gap-5">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`p-8 text-2xl text-left border transition-all duration-500 ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold shadow-[0_10px_30px_rgba(255,183,77,0.2)] scale-[1.02]' : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#ffb74d]/50 hover:bg-[#111]'}`}>{s}</button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[#ffb74d] text-xs mb-8 opacity-40 uppercase tracking-[0.5em] font-bold border-l-4 border-[#ffb74d] pl-6">檔案分類</p>
            <div className="flex flex-col gap-5">
              {availableDecks.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-8 text-xl text-left border transition-all duration-500 ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] bg-[#ffb74d]/5 font-bold shadow-[inset_0_0_30px_rgba(255,183,77,0.1)]' : 'border-[#1a1a1a] bg-[#0a0a0a] opacity-50 hover:opacity-100 hover:border-[#ffb74d]/40'}`}>{d}</button>
              ))}
            </div>
          </section>
        </div>

        {/* 右側檢索區域 - 修正滾動與佈局 */}
        <div className="flex-1 flex flex-col gap-12 min-w-0 overflow-hidden">
          <div className="flex-none flex gap-8">
            <input type="text" placeholder="深度檢索編號..." className="flex-1 p-10 bg-[#050505] border border-[#1a1a1a] text-4xl outline-none focus:border-[#ffb74d] focus:bg-black transition-all placeholder:opacity-10" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("此紀錄未被編錄。");
                });
              }
            }} className="px-24 bg-[#ffb74d] text-black font-bold uppercase text-2xl hover:brightness-110 active:scale-95 transition-all">Seek</button>
          </div>

          {/* 內容容器 - 修正 iPad 滾動與網格比例 */}
          <div className="flex-1 border border-[#1a1a1a] p-12 relative bg-[#050505] shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] overflow-y-auto custom-scrollbar min-h-0 rounded-sm">
            {isAdmin ? (
              <div className="w-full max-w-4xl mx-auto text-center py-16 animate-fadeIn">
                <div className="relative border-2 border-dashed border-[#ffb74d]/20 p-32 bg-[#080808] hover:border-[#ffb74d]/60 transition-all cursor-pointer">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="flex flex-col items-center gap-12">
                    <div className="text-[10rem] opacity-30">📁</div>
                    <p className="text-5xl font-bold tracking-[0.2em] text-[#ffb74d]">{uploadStatus || "奉獻資料夾"}</p>
                    {currentUploadingFile && <p className="text-xl font-mono text-[#ffb74d] animate-pulse">Processing: {currentUploadingFile}</p>}
                  </div>
                  {uploadProgress > 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-3 bg-black/50 overflow-hidden">
                      <div className="h-full bg-[#ffb74d] shadow-[0_0_20px_#ffb74d]" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  )}
                </div>
                <button onClick={() => setIsAdmin(false)} className="mt-20 text-sm opacity-20 hover:opacity-100 hover:text-[#ffb74d] transition-all tracking-[1em] uppercase border-b border-transparent hover:border-[#ffb74d] pb-2">Exit Management</button>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full flex flex-col items-center py-20 animate-fadeIn h-full justify-center">
                <div className="mb-12 flex items-center gap-12 opacity-30">
                  <div className="h-[2px] w-40 bg-[#ffb74d]"></div>
                  <span className="text-lg tracking-[1.5em] font-bold uppercase">{currentCard.scenario} / {currentCard.deckType}</span>
                  <div className="h-[2px] w-40 bg-[#ffb74d]"></div>
                </div>
                <h2 className="text-[15rem] md:text-[20rem] font-bold leading-none my-20 tracking-tighter text-[#ffb74d] drop-shadow-[0_20px_80px_rgba(255,183,77,0.4)] select-none">{currentCard.id}</h2>
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`relative w-72 h-72 rounded-full border-4 flex items-center justify-center transition-all duration-1000 shadow-2xl ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10 hover:border-[#ffb74d] hover:scale-110'}`}>
                  <div className="text-[10rem]">{isVoicePlaying ? '⚡' : '▶'}</div>
                </button>
                <button onClick={dismissCard} className="mt-32 px-24 py-8 border border-[#1a1a1a] text-lg opacity-20 hover:opacity-100 hover:bg-[#ffb74d] hover:text-black tracking-[1em] uppercase font-bold transition-all">Dismiss</button>
              </div>
            ) : (
              /* iPad 優化網格 - 根據斷點自動調整 */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-12 p-4">
                {cardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="aspect-[4/5] border border-[#1a1a1a] bg-[#080808] flex flex-col items-center justify-center p-12 group hover:border-[#ffb74d] hover:-translate-y-4 transition-all duration-700 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-[#ffb74d]/0 group-hover:bg-[#ffb74d]/100 transition-all"></div>
                    <span className="text-7xl font-bold group-hover:text-[#ffb74d] transition-all duration-700 tracking-tight">{card.id}</span>
                    <div className="mt-12 text-sm opacity-10 group-hover:opacity-100 transition-all tracking-[0.5em] uppercase font-bold">Inspect</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        :global(body) {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif;
          -webkit-font-smoothing: antialiased;
          background-color: #050505;
          margin: 0;
          color: #c9b99a;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #050505; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 20px; border: 2px solid #050505; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ffb74d; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 1s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
      `}</style>
    </div>
  );
}
