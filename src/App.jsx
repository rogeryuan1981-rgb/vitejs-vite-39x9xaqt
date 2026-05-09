import React, { useState, useEffect, useRef } from 'react';
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
  const [isCollapsed, setIsCollapsed] = useState(false); 
  
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
  
  // 語音播放狀態控管
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
        setCardList(items.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true})));
      });
    }
  }, [activeScenario, activeDeckType]);

  const initBgm = () => {
    if (bgmRef.current) { bgmRef.current.stop(); bgmRef.current.unload(); }
    bgmRef.current = new Howl({ src: [activeBgm.src], loop: true, volume: bgmVolume, html5: true });
    bgmRef.current.play();
  };

  useEffect(() => { if (isUnlocked) initBgm(); }, [activeBgm, isUnlocked]);
  useEffect(() => { if (bgmRef.current) bgmRef.current.volume(bgmVolume); }, [bgmVolume]);

  // --- 進階語音控制邏輯 ---
  const playVoice = (url) => {
    if (!isUnlocked || !url) return;
    
    // 如果是暫停中則恢復
    if (isVoicePaused && voiceRef.current) {
      voiceRef.current.play();
      setIsVoicePaused(false);
      setIsVoicePlaying(true);
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

  const pauseVoice = () => {
    if (voiceRef.current && isVoicePlaying) {
      voiceRef.current.pause();
    }
  };

  const stopVoice = () => {
    if (voiceRef.current) {
      voiceRef.current.stop();
    }
  };

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
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類";
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
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#050505] text-[#c9b99a] font-sans">
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <button onClick={() => { setIsUnlocked(true); initBgm(); }} className="px-16 py-8 border-2 border-[#ffb74d] text-[#ffb74d] text-2xl font-bold tracking-[0.5em]">啟動檢索</button>
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
          <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-24 h-1 accent-[#ffb74d]" />
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* 左側選單 */}
        <aside className={`transition-all duration-500 border-r border-[#1a1a1a] flex flex-col bg-[#080808] ${isCollapsed ? 'w-20' : 'w-72'}`}>
          <div className="p-4 flex justify-end">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-[#ffb74d] opacity-40 hover:opacity-100 text-xl">{isCollapsed ? "»" : "«"}</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
            <p className="text-[10px] text-[#ffb74d] opacity-30 uppercase tracking-widest mb-4 font-bold text-center">劇本</p>
            {scenarios.map(s => (
              <button key={s} onClick={() => { setActiveScenario(s); setIsCollapsed(true); }} className={`w-full p-4 mb-2 text-left text-lg border ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-60'}`}>
                {isCollapsed ? s.charAt(0) : s}
              </button>
            ))}
            <p className="text-[10px] text-[#ffb74d] opacity-30 uppercase tracking-widest my-4 font-bold text-center">分類</p>
            {availableDecks.map(d => (
              <button key={d} onClick={() => { setActiveDeckType(d); setIsCollapsed(true); }} className={`w-full p-4 mb-2 text-left text-sm border ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-40'}`}>
                {isCollapsed ? d.charAt(0) : d}
              </button>
            ))}
          </div>
        </aside>

        {/* 右側內容區 */}
        <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
          <div className="flex gap-4">
            {/* 修改：使用 inputMode="numeric" 並優化寬度 */}
            <input 
              type="text" 
              inputMode="numeric"
              placeholder="檢索編號..." 
              className="flex-1 p-5 bg-[#0a0a0a] border border-[#1a1a1a] text-2xl text-[#ffb74d] outline-none font-mono" 
              value={searchId} 
              onChange={(e) => setSearchId(e.target.value)} 
            />
            <button onClick={() => {
              getDoc(doc(db, "cards", searchId.toUpperCase())).then(ds => {
                if(ds.exists()) { setCurrentCard(ds.data()); stopVoice(); playVoice(ds.data().audioUrl); }
                else alert("查無紀錄");
              });
            }} className="px-6 bg-[#ffb74d] text-black font-bold uppercase text-sm">搜尋</button>
          </div>

          <div className="flex-1 border border-[#1a1a1a] bg-[#050505] overflow-y-auto p-8 custom-scrollbar relative">
            {isAdmin ? (
              <div className="text-center p-10">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} />
                <p className="text-[#ffb74d] mt-4">{uploadStatus} {uploadProgress}%</p>
                <button onClick={() => setIsAdmin(false)} className="mt-10 opacity-40 underline">關閉管理模式</button>
              </div>
            ) : currentCard ? (
              <div className="h-full flex flex-col items-center justify-center animate-fadeIn">
                <p className="opacity-30 tracking-[0.5em] mb-4 text-xs uppercase">{currentCard.scenario} / {currentCard.deckType}</p>
                {/* 修改：縮小字體並確保排版 */}
                <h2 className="text-6xl md:text-8xl font-bold text-[#ffb74d] mb-12 font-mono break-all text-center px-10">{currentCard.id}</h2>
                
                {/* 新增：播放控制器 */}
                <div className="flex items-center gap-10">
                  <button onClick={() => stopVoice()} className="w-16 h-16 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-xl flex items-center justify-center hover:bg-red-900/20 transition-all">■</button>
                  
                  <button 
                    onClick={() => isVoicePlaying ? pauseVoice() : playVoice(currentCard.audioUrl)} 
                    className={`w-32 h-32 rounded-full border-4 flex items-center justify-center text-5xl transition-all ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10'}`}
                  >
                    {isVoicePlaying ? '||' : '▶'}
                  </button>
                  
                  <button onClick={() => { stopVoice(); playVoice(currentCard.audioUrl); }} className="w-16 h-16 rounded-full border border-[#ffb74d]/30 text-[#ffb74d] text-xl flex items-center justify-center hover:bg-[#ffb74d]/10 transition-all">↻</button>
                </div>

                <button onClick={() => { stopVoice(); setCurrentCard(null); }} className="mt-12 opacity-30 uppercase tracking-[0.4em] text-[10px] hover:opacity-100 transition-opacity">關閉檔案回列表</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {cardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); stopVoice(); playVoice(card.audioUrl); }} className="min-h-[200px] flex flex-col items-start justify-center border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#ffb74d] transition-all p-8 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#ffb74d] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    {/* 修改：靠左排版，font-mono 確保數字對齊 */}
                    <span className="text-3xl font-bold mb-4 font-mono text-left w-full break-words">{card.id}</span>
                    <span className="text-[10px] opacity-20 font-bold uppercase tracking-widest">Open Archive</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        /* 隱藏數字輸入框的上下箭頭 */
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}
