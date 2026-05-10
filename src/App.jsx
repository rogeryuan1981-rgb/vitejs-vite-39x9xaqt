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

  // 初始化
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

  // BGM 控制
  const initBgm = () => {
    if (bgmRef.current) { bgmRef.current.stop(); bgmRef.current.unload(); }
    bgmRef.current = new Howl({ 
      src: [activeBgm.src], loop: true, volume: bgmVolume, html5: true, preload: true
    });
    bgmRef.current.play();
  };

  useEffect(() => { if (isUnlocked) initBgm(); }, [activeBgm, isUnlocked]);

  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.volume(bgmVolume);
      bgmRef.current.mute(bgmVolume === 0);
    }
  }, [bgmVolume]);

  // 語音控制
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

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files) return;
    setUploadStatus('同步中');
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts[pathParts.length - 3] || "未命名";
      let deck = pathParts[pathParts.length - 2] || "未分類";
      try {
        const storageRef = ref(storage, `audios/${scen}/${deck}/${file.name}`);
        await uploadBytesResumable(storageRef, file);
        const url = await getDownloadURL(storageRef);
        await setDoc(doc(db, "cards", cardId), { id: cardId, scenario: scen, deckType: deck, audioUrl: url });
        setUploadProgress(Math.round(((i + 1) / audioFiles.length) * 100));
      } catch (e) { console.error(e); }
    }
    setUploadStatus("完成");
    fetchScenarios();
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050505] text-[#c9b99a] font-sans overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')]"></div>
      
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <button onClick={() => { setIsUnlocked(true); initBgm(); }} className="px-12 py-6 border-2 border-[#ffb74d] text-[#ffb74d] text-xl font-bold tracking-[0.5em] active:scale-95 transition-transform">啟動檢視</button>
        </div>
      )}

      {/* Header - 響應式調整 */}
      <header className="flex-none flex flex-col sm:flex-row justify-between items-center px-4 py-4 sm:px-8 sm:py-6 border-b border-[#1a1a1a] bg-[#0a0a0a] z-20 gap-4">
        <div className="flex items-center gap-3 cursor-pointer" onClick={handleAdminTrigger}>
          <div className="text-[#ffb74d] text-2xl">👁️</div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#ffb74d] tracking-tighter">禁忌檔案庫 {isAdmin && " [M]"}</h1>
        </div>
        <div className="flex items-center gap-4 bg-black/40 p-3 border border-[#1a1a1a] w-full sm:w-auto justify-between">
          <select className="bg-transparent text-xs text-[#ffb74d] outline-none border-r border-[#1a1a1a] pr-4" onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
            {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
          </select>
          <div className="flex items-center gap-3 flex-1 px-2">
            <span className="text-[8px] text-[#ffb74d] opacity-40 uppercase font-bold">VOL</span>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onInput={(e) => setBgmVolume(parseFloat(e.target.value))} className="flex-1 h-1 accent-[#ffb74d]" />
          </div>
        </div>
      </header>

      {/* 主體區域 - 手機版改為 col */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden h-full">
        {/* 左側選單 - 手機版高度固定，平板以上寬度固定 */}
        <aside className={`transition-all duration-500 border-[#1a1a1a] flex flex-col bg-[#080808] 
          ${isCollapsed ? 'md:w-20 h-16 md:h-full' : 'md:w-72 h-48 md:h-full'} 
          border-b md:border-b-0 md:border-r overflow-hidden`}>
          
          <div className="p-3 flex justify-between md:justify-end items-center">
            <span className="md:hidden text-[10px] text-[#ffb74d] font-bold px-2">劇本/分類切換</span>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-[#ffb74d] opacity-60 p-2 text-xl">{isCollapsed ? "▼" : "▲"}</button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
            <p className="text-[8px] text-[#ffb74d] opacity-30 uppercase tracking-[0.3em] mb-2 font-bold text-center">Scenarios</p>
            <div className="flex md:flex-col gap-2 mb-4">
              {scenarios.map(s => (
                <button key={s} onClick={() => { setActiveScenario(s); if(window.innerWidth < 768) setIsCollapsed(true); }} className={`whitespace-nowrap md:whitespace-normal p-3 text-xs border ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-50'}`}>
                  {isCollapsed ? s.charAt(0) : s}
                </button>
              ))}
            </div>
            <p className="text-[8px] text-[#ffb74d] opacity-30 uppercase tracking-[0.3em] mb-2 font-bold text-center">Types</p>
            <div className="flex md:flex-col gap-2 pb-6">
              {availableDecks.map(d => (
                <button key={d} onClick={() => { setActiveDeckType(d); if(window.innerWidth < 768) setIsCollapsed(true); }} className={`whitespace-nowrap md:whitespace-normal p-3 text-xs border ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-40'}`}>
                  {isCollapsed ? d.charAt(0) : d}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 右側內容區 - 強制滾動修復 */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#050505]">
          
          {/* 數字鍵盤區 */}
          <div className="flex-none flex flex-col gap-3 bg-[#0a0a0a] p-4 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-black border border-[#ffb74d]/20 p-3 text-2xl font-mono text-[#ffb74d] min-h-[50px] flex items-center tracking-widest overflow-hidden">
                {searchId || <span className="opacity-10 text-sm">NO DATA...</span>}
              </div>
              <button onClick={() => setSearchId(prev => prev.slice(0, -1))} className="p-3 bg-[#1a1a1a] text-[#ffb74d] border border-[#ffb74d]/20 px-6 active:bg-[#ffb74d] active:text-black">←</button>
              <button onClick={() => setSearchId('')} className="p-3 bg-[#1a1a1a] text-red-500 border border-red-500/20 px-4">X</button>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                <button key={num} onClick={() => setSearchId(prev => prev + num.toString())} className="py-4 bg-[#080808] border border-[#1a1a1a] text-lg font-bold active:border-[#ffb74d] active:text-[#ffb74d]">
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* 卡片清單區 - 手機滾動核心修正 */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar h-full -webkit-overflow-scrolling-touch">
            {isAdmin ? (
              <div className="text-center py-10">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="text-xs" />
                <p className="text-[#ffb74d] mt-4 text-sm">{uploadStatus} {uploadProgress}%</p>
                <button onClick={() => setIsAdmin(false)} className="mt-10 opacity-40 text-xs underline">EXIT ADMIN</button>
              </div>
            ) : currentCard ? (
              <div className="h-full flex flex-col items-center justify-center animate-fadeIn py-6">
                <p className="opacity-30 tracking-[0.3em] mb-4 text-[10px] uppercase">{currentCard.scenario} / {currentCard.deckType}</p>
                <h2 className="text-5xl sm:text-8xl font-bold text-[#ffb74d] mb-10 font-mono tracking-tighter text-center break-all">{currentCard.id}</h2>
                <div className="flex items-center gap-6 sm:gap-10">
                  <button onClick={() => stopVoice()} className="w-14 h-14 sm:w-20 sm:h-20 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-xl flex items-center justify-center">■</button>
                  <button onClick={() => isVoicePlaying ? pauseVoice() : playVoice(currentCard.audioUrl)} className={`w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 flex items-center justify-center text-5xl ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10'}`}>
                    {isVoicePlaying ? '||' : '▶'}
                  </button>
                  <button onClick={() => { stopVoice(); playVoice(currentCard.audioUrl); }} className="w-14 h-14 sm:w-20 sm:h-20 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-xl flex items-center justify-center">↻</button>
                </div>
                <button onClick={() => { stopVoice(); setCurrentCard(null); }} className="mt-12 opacity-30 uppercase tracking-[0.4em] text-[10px] font-bold border-b border-transparent hover:border-[#c9b99a]">CLOSE ARCHIVE</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                {filteredCardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); stopVoice(); playVoice(card.audioUrl); }} className="min-h-[120px] flex flex-col items-start justify-center border border-[#1a1a1a] bg-[#0a0a0a] active:border-[#ffb74d] p-6 relative group">
                    <div className="absolute left-0 top-0 h-full w-1 bg-[#ffb74d] opacity-20"></div>
                    <span className="text-2xl font-bold mb-2 font-mono break-all text-left">{card.id}</span>
                    <span className="text-[8px] opacity-20 uppercase tracking-widest font-bold">Access Data</span>
                  </button>
                ))}
                {filteredCardList.length === 0 && (
                  <div className="col-span-full py-20 text-center opacity-10 text-xl tracking-[0.5em]">NO MATCH</div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-runnable-track { background: #1a1a1a; height: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; background: #ffb74d; margin-top: -5px; border-radius: 50%; }
      `}</style>
    </div>
  );
}
