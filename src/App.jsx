import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Howl, Howler } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where, setDoc } from "firebase/firestore";
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

  // --- 手機端 BGM 強化控制 ---
  const initBgm = () => {
    if (bgmRef.current) { bgmRef.current.stop(); bgmRef.current.unload(); }
    bgmRef.current = new Howl({ 
      src: [activeBgm.src], 
      loop: true, 
      volume: bgmVolume * 0.3, 
      html5: true, 
      preload: true
    });
    bgmRef.current.play();
  };

  useEffect(() => { if (isUnlocked) initBgm(); }, [activeBgm, isUnlocked]);

  // 同步音量：修正手機版不反應的問題
  useEffect(() => {
    if (bgmRef.current) {
      const baseVol = bgmVolume * 0.3;
      const finalVol = isVoicePlaying ? baseVol * 0.3 : baseVol;
      bgmRef.current.volume(finalVol);
      
      // 行動端強制指令
      if (bgmVolume === 0) {
        bgmRef.current.mute(true);
      } else {
        bgmRef.current.mute(false);
      }
    }
  }, [bgmVolume, isVoicePlaying]);

  // --- 語音播放控制 ---
  const playVoice = (url) => {
    if (!isUnlocked || !url) return;
    if (isVoicePaused && voiceRef.current) {
      voiceRef.current.play();
      return;
    }
    if (voiceRef.current) voiceRef.current.unload();
    voiceRef.current = new Howl({
      src: [url], 
      html5: true, 
      format: ['mp3', 'wav'],
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
          <button onClick={() => { setIsUnlocked(true); initBgm(); }} className="px-12 py-6 border-2 border-[#ffb74d] text-[#ffb74d] text-xl font-bold tracking-[0.5em]">啟動檢索</button>
        </div>
      )}

      <header className="flex-none flex flex-row justify-between items-center px-4 py-2 border-b border-[#1a1a1a] bg-[#0a0a0a] z-20 h-auto landscape:py-1">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleAdminTrigger}>
          <div className="text-[#ffb74d] text-xl">👁️</div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#ffb74d] tracking-tighter landscape:text-base">禁忌檔案庫 {isAdmin && " [M]"}</h1>
        </div>
        <div className="flex items-center gap-3 bg-black/40 p-2 border border-[#1a1a1a] landscape:p-1">
          <select className="bg-transparent text-[10px] text-[#ffb74d] outline-none border-r border-[#1a1a1a] pr-2" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
            {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-black text-[#ffb74d]">{b.name}</option>)}
          </select>
          <div className="flex items-center gap-2 px-1">
            <span className="text-[8px] text-[#ffb74d] opacity-40 font-bold uppercase">VOL</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={bgmVolume} 
              onInput={(e) => setBgmVolume(parseFloat(e.target.value))} 
              className="w-16 sm:w-24 h-1 accent-[#ffb74d] cursor-pointer" 
            />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <aside className={`transition-all duration-500 border-[#1a1a1a] flex flex-col bg-[#080808] 
          ${isCollapsed ? 'md:w-16 h-10 md:h-full' : 'md:w-64 h-32 md:h-full'} 
          border-b md:border-b-0 md:border-r overflow-hidden landscape:h-10 md:landscape:h-full`}>
          
          <div className="p-2 flex justify-between md:justify-end items-center">
            <span className="md:hidden text-[9px] text-[#ffb74d] font-bold px-1 uppercase tracking-widest italic opacity-20">Terminal Sidebar</span>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-[#ffb74d] opacity-60 p-1 text-base">{isCollapsed ? "▼" : "▲"}</button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 custom-scrollbar landscape:hidden md:landscape:block">
            <div className="flex md:flex-col gap-1 mb-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => { setActiveScenario(s); if(window.innerWidth < 768) setIsCollapsed(true); }} className={`p-2 text-[10px] text-left border ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-50'}`}>
                  {isCollapsed ? s.charAt(0) : s}
                </button>
              ))}
            </div>
            <div className="flex md:flex-col gap-1 pb-4 border-t border-[#1a1a1a] pt-2">
              {availableDecks.map(d => (
                <button key={d} onClick={() => { setActiveDeckType(d); if(window.innerWidth < 768) setIsCollapsed(true); }} className={`p-2 text-[10px] text-left border ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-40'}`}>
                  {isCollapsed ? d.charAt(0) : d}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-none flex flex-col gap-2 bg-[#0a0a0a] p-3 border-b border-[#1a1a1a] landscape:p-1 landscape:gap-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-black border border-[#ffb74d]/20 p-2 text-xl font-mono text-[#ffb74d] min-h-[40px] flex items-center tracking-widest">
                {searchId || <span className="opacity-10 text-[10px]">DIAL NUMBER...</span>}
              </div>
              <button onClick={() => setSearchId(prev => prev.slice(0, -1))} className="p-2 bg-[#1a1a1a] text-[#ffb74d] border border-[#ffb74d]/20 px-4 active:bg-[#ffb74d] transition-colors">←</button>
              <button onClick={() => setSearchId('')} className="p-2 bg-[#1a1a1a] text-red-500 border border-red-500/20 px-3 active:bg-red-500">X</button>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                <button key={num} onClick={() => setSearchId(prev => prev + num.toString())} className="py-3 bg-[#080808] border border-[#1a1a1a] text-sm font-bold active:border-[#ffb74d] active:text-[#ffb74d] landscape:py-1">
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar h-full -webkit-overflow-scrolling-touch landscape:p-2">
            {isAdmin ? (
              <div className="text-center py-6">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="text-[10px] mb-4" />
                <p className="text-[#ffb74d] text-xs">{uploadStatus}</p>
                <button onClick={() => setIsAdmin(false)} className="mt-4 opacity-40 text-[10px] underline">DISMISS ADMIN</button>
              </div>
            ) : currentCard ? (
              <div className="min-h-full flex flex-col items-center justify-center animate-fadeIn py-4">
                <p className="opacity-30 tracking-[0.3em] mb-2 text-[9px] uppercase">{currentCard.scenario} / {currentCard.deckType}</p>
                <h2 className="text-5xl sm:text-7xl font-bold text-[#ffb74d] mb-6 font-mono text-center landscape:text-4xl">{currentCard.id}</h2>
                <div className="flex items-center gap-6">
                  <button onClick={() => stopVoice()} className="w-12 h-12 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] flex items-center justify-center active:scale-95 transition-transform">■</button>
                  <button onClick={() => isVoicePlaying ? pauseVoice() : playVoice(currentCard.audioUrl)} className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-4xl ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10'} active:scale-95 transition-transform`}>
                    {isVoicePlaying ? '||' : '▶'}
                  </button>
                  <button onClick={() => { stopVoice(); playVoice(currentCard.audioUrl); }} className="w-12 h-12 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] flex items-center justify-center active:scale-95 transition-transform">↻</button>
                </div>
                <button onClick={() => { stopVoice(); setCurrentCard(null); }} className="mt-8 opacity-30 uppercase tracking-[0.4em] text-[8px] font-bold">Return to Library</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-10">
                {filteredCardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); stopVoice(); playVoice(card.audioUrl); }} className="min-h-[100px] flex flex-col items-start justify-center border border-[#1a1a1a] bg-[#0a0a0a] active:border-[#ffb74d] p-4 relative landscape:min-h-[80px]">
                    <div className="absolute left-0 top-0 h-full w-1 bg-[#ffb74d] opacity-20"></div>
                    <span className="text-xl font-bold mb-1 font-mono text-left">{card.id}</span>
                    <span className="text-[7px] opacity-20 uppercase tracking-widest font-bold tracking-tighter italic">Accessing Record...</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        /* 優化手機拉桿觸感 */
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-runnable-track { background: #222; height: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: #ffb74d; margin-top: -6px; }
      `}</style>
    </div>
  );
}
