import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Howl, Howler } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, query, where, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'bgm2', name: '音軌 II', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'bgm3', name: '音軌 III', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

export default function App() {
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0); 
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); 
  
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
  const [fullCardList, setFullCardList] = useState([]); 
  
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [isVoicePaused, setIsVoicePaused] = useState(false);

  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        await fetchScenarios();
      } catch (error) { console.error(error); }
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

  useEffect(() => {
    if (activeScenario) {
      stopVoice();
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
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeScenario && activeDeckType) {
      const q = query(collection(db, "cards"), where("scenario", "==", activeScenario), where("deckType", "==", activeDeckType));
      getDocs(q).then(snap => {
        const items = [];
        snap.forEach(d => items.push(d.data()));
        setFullCardList(items.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true})));
      });
    }
  }, [activeScenario, activeDeckType]);

  const filteredCardList = useMemo(() => {
    if (!searchId) return fullCardList;
    return fullCardList.filter(card => card.id.includes(searchId));
  }, [searchId, fullCardList]);

  // --- BGM 控制 (針對手機版優化) ---
  const initBgm = () => {
    if (bgmRef.current) { bgmRef.current.stop(); bgmRef.current.unload(); }
    bgmRef.current = new Howl({ 
      src: [activeBgm.src], 
      loop: true, 
      volume: bgmVolume, 
      html5: true, // 手機版必須開啟 html5 模式以支援大檔案與串流
      preload: true
    });
    bgmRef.current.play();
  };

  useEffect(() => { if (isUnlocked) initBgm(); }, [activeBgm, isUnlocked]);

  // 核心修正：手機 Chrome 拉桿音量同步
  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.volume(bgmVolume);
      // 行動端靜音保護邏輯
      if (bgmVolume === 0) bgmRef.current.mute(true);
      else bgmRef.current.mute(false);
    }
  }, [bgmVolume]);

  const startRitual = () => {
    setIsUnlocked(true);
    Howler.unload();
    initBgm();
  };

  // --- 語音播放控制 ---
  const playVoice = (url) => {
    if (!isUnlocked || !url) return;
    if (isVoicePaused && voiceRef.current) {
      voiceRef.current.play();
      return;
    }
    if (voiceRef.current) voiceRef.current.unload();
    voiceRef.current = new Howl({
      src: [url], html5: true, format: ['mp3', 'wav'],
      onplay: () => { setIsVoicePlaying(true); setIsVoicePaused(false); },
      onpause: () => { setIsVoicePlaying(false); setIsVoicePaused(true); },
      onend: () => { setIsVoicePlaying(false); setIsVoicePaused(false); },
      onstop: () => { setIsVoicePlaying(false); setIsVoicePaused(false); }
    });
    voiceRef.current.play();
  };
  const pauseVoice = () => voiceRef.current?.pause();
  const stopVoice = () => voiceRef.current?.stop();

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#050505] text-[#c9b99a] font-sans">
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')]"></div>
      
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <button onClick={startRitual} className="px-16 py-8 border-2 border-[#ffb74d] text-[#ffb74d] text-2xl font-bold tracking-[0.5em]">啟動檢視</button>
        </div>
      )}

      {/* Header */}
      <header className="flex-none flex justify-between items-center px-8 py-6 border-b border-[#1a1a1a] bg-[#0a0a0a] z-20">
        <div className="flex items-center gap-4 cursor-pointer" onClick={handleAdminTrigger}>
          <div className="text-[#ffb74d] text-3xl">👁️</div>
          <h1 className="text-3xl font-bold text-[#ffb74d] tracking-tighter">禁忌檔案庫 {isAdmin && " [M]"}</h1>
        </div>
        <div className="flex items-center gap-6 bg-black/40 p-4 border border-[#1a1a1a]">
          <span className="text-[10px] text-[#ffb74d] opacity-50 uppercase font-bold">BGM 頻道</span>
          <select className="bg-transparent text-sm text-[#ffb74d] outline-none" onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
            {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
          </select>
          {/* 修正點：使用 onInput 捕獲觸控滑動過程中的數值變化 */}
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={bgmVolume} 
            onInput={(e) => setBgmVolume(parseFloat(e.target.value))} 
            className="w-24 h-1 accent-[#ffb74d]" 
          />
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className={`transition-all duration-500 border-r border-[#1a1a1a] flex flex-col bg-[#080808] ${isCollapsed ? 'w-20' : 'w-72'}`}>
          <div className="p-4 flex justify-end">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-[#ffb74d] opacity-40 hover:opacity-100 text-xl">{isCollapsed ? "»" : "«"}</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
            <p className="text-[10px] text-[#ffb74d] opacity-30 uppercase tracking-widest mb-4 font-bold text-center">劇本</p>
            {scenarios.map(s => (
              <button key={s} onClick={() => setActiveScenario(s)} className={`w-full p-4 mb-2 text-left text-lg border ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-60'}`}>
                {isCollapsed ? s.charAt(0) : s}
              </button>
            ))}
            <p className="text-[10px] text-[#ffb74d] opacity-30 uppercase tracking-widest my-4 font-bold text-center">分類</p>
            {availableDecks.map(d => (
              <button key={d} onClick={() => setActiveDeckType(d)} className={`w-full p-4 mb-2 text-left text-sm border ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-40'}`}>
                {isCollapsed ? d.charAt(0) : d}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
          <div className="flex-none flex flex-col gap-4 bg-[#0a0a0a] p-6 border border-[#1a1a1a]">
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-black border border-[#ffb74d]/30 p-5 text-4xl font-mono text-[#ffb74d] tracking-widest min-h-[80px] flex items-center">
                {searchId || <span className="opacity-10">Waiting...</span>}
              </div>
              <button onClick={() => setSearchId(prev => prev.slice(0, -1))} className="px-8 py-5 bg-[#1a1a1a] text-[#ffb74d] text-2xl font-bold border border-[#ffb74d]/20">←</button>
              <button onClick={() => setSearchId('')} className="px-8 py-5 bg-[#1a1a1a] text-red-500 text-2xl font-bold border border-red-500/20">CLEAR</button>
            </div>
            <div className="grid grid-cols-10 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                <button 
                  key={num} 
                  onClick={() => setSearchId(prev => prev + num.toString())}
                  className="py-6 bg-[#080808] border border-[#1a1a1a] text-2xl font-bold hover:border-[#ffb74d] hover:text-[#ffb74d] transition-all"
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 border border-[#1a1a1a] bg-[#050505] overflow-y-auto p-8 custom-scrollbar relative">
            {isAdmin ? (
              <div className="text-center p-10">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} />
                <p className="text-[#ffb74d] mt-4">{uploadStatus} {uploadProgress}%</p>
                <button onClick={() => setIsAdmin(false)} className="mt-10 opacity-40 underline font-bold">關閉管理模式</button>
              </div>
            ) : currentCard ? (
              <div className="h-full flex flex-col items-center justify-center animate-fadeIn">
                <p className="opacity-30 tracking-[0.5em] mb-6 text-sm uppercase">{currentCard.scenario} / {currentCard.deckType}</p>
                <h2 className="text-6xl md:text-9xl font-bold text-[#ffb74d] mb-16 font-mono tracking-tight text-center px-10">{currentCard.id}</h2>
                <div className="flex items-center gap-10">
                  <button onClick={() => stopVoice()} className="w-20 h-20 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-3xl flex items-center justify-center">■</button>
                  <button 
                    onClick={() => isVoicePlaying ? pauseVoice() : playVoice(currentCard.audioUrl)} 
                    className={`w-40 h-40 rounded-full border-4 flex items-center justify-center text-7xl ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10'}`}
                  >
                    {isVoicePlaying ? '||' : '▶'}
                  </button>
                  <button onClick={() => { stopVoice(); playVoice(currentCard.audioUrl); }} className="w-20 h-20 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-3xl flex items-center justify-center">↻</button>
                </div>
                <button onClick={() => { stopVoice(); setCurrentCard(null); }} className="mt-16 opacity-30 uppercase tracking-[0.6em] text-xs font-bold">返回列表</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredCardList.map(card => (
                  <button 
                    key={card.id} 
                    onClick={() => { setCurrentCard(card); stopVoice(); playVoice(card.audioUrl); }} 
                    className="min-h-[180px] flex flex-col items-start justify-center border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#ffb74d] transition-all p-10 relative overflow-hidden group shadow-lg"
                  >
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#ffb74d] opacity-0 group-hover:opacity-100"></div>
                    <span className="text-3xl font-bold mb-4 font-mono text-left leading-tight">{card.id}</span>
                    <span className="text-[10px] opacity-20 font-bold uppercase tracking-widest">檢視檔案</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
      `}</style>
    </div>
  );
}
