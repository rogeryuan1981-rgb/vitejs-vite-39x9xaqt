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

      {/* Header - 橫向模式下大幅壓縮高度 */}
      <header className="flex-none flex flex-row justify-between items-center px-4 py-2 sm:py-4 border-b border-[#1a1a1a] bg-[#0a0a0a] z-20 gap-2 h-auto landscape:py-1">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleAdminTrigger}>
          <div className="text-[#ffb74d] text-xl landscape:text-lg">👁️</div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#ffb74d] tracking-tighter landscape:text-base">禁忌檔案庫 {isAdmin && " [M]"}</h1>
        </div>
        <div className="flex items-center gap-3 bg-black/40 p-2 border border-[#1a1a1a] landscape:p-1">
          <select className="bg-transparent text-[10px] text-[#ffb74d] outline-none border-r border-[#1a1a1a] pr-2 landscape:text-[9px]" onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
            {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
          </select>
          <div className="flex items-center gap-2 px-1">
            <span className="text-[8px] text-[#ffb74d] opacity-40 font-bold">V</span>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onInput={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-16 sm:w-24 h-1 accent-[#ffb74d]" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* 左側選單 - 橫向時預設內縮 */}
        <aside className={`transition-all duration-500 border-[#1a1a1a] flex flex-col bg-[#080808] 
          ${isCollapsed ? 'md:w-16 h-10 md:h-full' : 'md:w-64 h-32 md:h-full'} 
          border-b md:border-b-0 md:border-r overflow-hidden landscape:h-10 landscape:md:h-full`}>
          
          <div className="p-2 flex justify-between md:justify-end items-center landscape:p-1">
            <span className="md:hidden text-[9px] text-[#ffb74d] font-bold px-1">MENU</span>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-[#ffb74d] opacity-60 p-1 text-base">{isCollapsed ? "▼" : "▲"}</button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 custom-scrollbar landscape:hidden md:landscape:block">
            <div className="flex md:flex-col gap-1 mb-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => { setActiveScenario(s); if(window.innerWidth < 768) setIsCollapsed(true); }} className={`p-2 text-[10px] border ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d]' : 'border-[#1a1a1a] opacity-50'}`}>
                  {isCollapsed ? s.charAt(0) : s}
                </button>
              ))}
            </div>
            <div className="flex md:flex-col gap-1 pb-4">
              {availableDecks.map(d => (
                <button key(d) onClick={() => { setActiveDeckType(d); if(window.innerWidth < 768) setIsCollapsed(true); }} className={`p-2 text-[10px] border ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d]' : 'border-[#1a1a1a] opacity-40'}`}>
                  {isCollapsed ? d.charAt(0) : d}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* 右側內容區 */}
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* 數字鍵盤區 - 橫向模式下極簡化佈局 */}
          <div className="flex-none flex flex-col gap-2 bg-[#0a0a0a] p-3 border-b border-[#1a1a1a] landscape:p-1 landscape:gap-1">
            <div className="flex items-center gap-2 landscape:gap-1">
              <div className="flex-1 bg-black border border-[#ffb74d]/20 p-2 text-xl font-mono text-[#ffb74d] min-h-[40px] flex items-center tracking-widest landscape:text-base landscape:min-h-[30px]">
                {searchId || <span className="opacity-10 text-[10px]">ACCESSING...</span>}
              </div>
              <button onClick={() => setSearchId(prev => prev.slice(0, -1))} className="p-2 bg-[#1a1a1a] text-[#ffb74d] border border-[#ffb74d]/20 px-4 active:bg-[#ffb74d] landscape:p-1">←</button>
              <button onClick={() => setSearchId('')} className="p-2 bg-[#1a1a1a] text-red-500 border border-red-500/20 px-3 landscape:p-1">X</button>
            </div>
            <div className="grid grid-cols-10 gap-1 landscape:max-w-4xl mx-auto w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                <button key={num} onClick={() => setSearchId(prev => prev + num.toString())} className="py-3 bg-[#080808] border border-[#1a1a1a] text-sm font-bold active:border-[#ffb74d] active:text-[#ffb74d] landscape:py-1">
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* 卡片清單區 - 核心滾動修正 */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar h-full -webkit-overflow-scrolling-touch landscape:p-2">
            {isAdmin ? (
              <div className="text-center py-6">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="text-[10px]" />
                <p className="text-[#ffb74d] mt-2 text-xs">{uploadStatus} {uploadProgress}%</p>
                <button onClick={() => setIsAdmin(false)} className="mt-4 opacity-40 text-[10px] underline">EXIT</button>
              </div>
            ) : currentCard ? (
              <div className="min-h-full flex flex-col items-center justify-center animate-fadeIn py-4">
                <p className="opacity-30 tracking-[0.3em] mb-2 text-[9px] uppercase landscape:mb-1">{currentCard.scenario} / {currentCard.deckType}</p>
                <h2 className="text-5xl sm:text-8xl font-bold text-[#ffb74d] mb-6 font-mono tracking-tighter text-center landscape:text-4xl landscape:mb-4">{currentCard.id}</h2>
                <div className="flex items-center gap-6">
                  <button onClick={() => stopVoice()} className="w-12 h-12 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-base flex items-center justify-center landscape:w-10 landscape:h-10">■</button>
                  <button onClick={() => isVoicePlaying ? pauseVoice() : playVoice(currentCard.audioUrl)} className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-4xl ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10'} landscape:w-20 landscape:h-20`}>
                    {isVoicePlaying ? '||' : '▶'}
                  </button>
                  <button onClick={() => { stopVoice(); playVoice(currentCard.audioUrl); }} className="w-12 h-12 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-base flex items-center justify-center landscape:w-10 landscape:h-10">↻</button>
                </div>
                <button onClick={() => { stopVoice(); setCurrentCard(null); }} className="mt-6 opacity-30 uppercase tracking-[0.4em] text-[8px] font-bold landscape:mt-4">CLOSE</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-10">
                {filteredCardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); stopVoice(); playVoice(card.audioUrl); }} className="min-h-[100px] flex flex-col items-start justify-center border border-[#1a1a1a] bg-[#0a0a0a] active:border-[#ffb74d] p-4 relative group landscape:min-h-[80px]">
                    <div className="absolute left-0 top-0 h-full w-1 bg-[#ffb74d] opacity-20"></div>
                    <span className="text-xl font-bold mb-1 font-mono text-left landscape:text-lg">{card.id}</span>
                    <span className="text-[7px] opacity-20 uppercase tracking-widest font-bold">ACCESS</span>
                  </button>
                ))}
                {filteredCardList.length === 0 && (
                  <div className="col-span-full py-10 text-center opacity-10 text-sm tracking-[0.5em]">NO DATA FOUND</div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
        @media (orientation: landscape) and (max-height: 500px) {
          header { padding-top: 2px; padding-bottom: 2px; }
          .landscape-compact { display: none; }
        }
      `}</style>
    </div>
  );
}
