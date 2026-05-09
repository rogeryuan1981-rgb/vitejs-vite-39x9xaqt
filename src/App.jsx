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
  const [isCollapsed, setIsCollapsed] = useState(false); // 新增：左側內縮狀態
  
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
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

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
      setScenarios(Array.from(scenarioSet).sort());
      if (scenarioSet.size > 0 && !activeScenario) setActiveScenario(Array.from(scenarioSet).sort()[0]);
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

  const playVoice = (url) => {
    if (!isUnlocked || !url) return;
    if (voiceRef.current) voiceRef.current.unload();
    setIsVoicePlaying(true);
    voiceRef.current = new Howl({
      src: [url], html5: true, format: ['mp3', 'wav'],
      onend: () => setIsVoicePlaying(false), onstop: () => setIsVoicePlaying(false)
    });
    voiceRef.current.play();
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
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#050505] text-[#c9b99a] font-sans">
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <button onClick={() => { setIsUnlocked(true); initBgm(); }} className="px-16 py-8 border-2 border-[#ffb74d] text-[#ffb74d] text-2xl font-bold tracking-[0.5em]">啟動檢索</button>
        </div>
      )}

      {/* Header - 按鈕與 BGM 區域優化 */}
      <header className="flex-none flex justify-between items-center px-8 py-6 border-b border-[#1a1a1a] bg-[#0a0a0a] z-20">
        <div className="flex items-center gap-4 cursor-pointer" onClick={handleAdminTrigger}>
          <div className="text-[#ffb74d] text-3xl">👁️</div>
          <h1 className="text-3xl font-bold text-[#ffb74d] tracking-tighter">禁忌檔案庫 {isAdmin && " [M]"}</h1>
        </div>
        <div className="flex items-center gap-6 bg-black/40 p-4 border border-[#1a1a1a]">
          <span className="text-[10px] text-[#ffb74d] opacity-50 uppercase font-bold">BGM</span>
          <select className="bg-transparent text-sm text-[#ffb74d] outline-none" onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
            {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
          </select>
          <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-24 h-1 accent-[#ffb74d]" />
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* 左側選單 - 支援內縮縮減 */}
        <aside className={`transition-all duration-500 border-r border-[#1a1a1a] flex flex-col bg-[#080808] ${isCollapsed ? 'w-20' : 'w-72'}`}>
          <div className="p-4 flex justify-end">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-[#ffb74d] opacity-40 hover:opacity-100 text-xl">{isCollapsed ? "»" : "«"}</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
            <p className="text-[10px] text-[#ffb74d] opacity-30 uppercase tracking-widest mb-4 font-bold text-center">{isCollapsed ? "S" : "劇本清單"}</p>
            {scenarios.map(s => (
              <button key={s} onClick={() => { setActiveScenario(s); setIsCollapsed(true); }} className={`w-full p-4 mb-2 text-left text-lg border ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] opacity-60'}`}>
                {isCollapsed ? s.charAt(0) : s}
              </button>
            ))}
            <p className="text-[10px] text-[#ffb74d] opacity-30 uppercase tracking-widest my-4 font-bold text-center">{isCollapsed ? "D" : "檔案分類"}</p>
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
            <input type="text" placeholder="檢索編號..." className="flex-1 p-5 bg-[#0a0a0a] border border-[#1a1a1a] text-2xl text-[#ffb74d] outline-none" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              getDoc(doc(db, "cards", searchId.toUpperCase())).then(ds => {
                if(ds.exists()) { setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                else alert("查無紀錄");
              });
            }} className="px-8 bg-[#ffb74d] text-black font-bold uppercase text-sm">搜尋</button>
          </div>

          <div className="flex-1 border border-[#1a1a1a] bg-[#050505] overflow-y-auto p-8 custom-scrollbar">
            {isAdmin ? (
              <div className="text-center p-10">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="mb-4" />
                <p className="text-[#ffb74d]">{uploadStatus} {uploadProgress}%</p>
                <button onClick={() => setIsAdmin(false)} className="mt-10 opacity-40 underline">離開管理員</button>
              </div>
            ) : currentCard ? (
              <div className="h-full flex flex-col items-center justify-center animate-fadeIn text-center">
                <p className="opacity-30 tracking-[1em] mb-4 text-xs">{currentCard.scenario} / {currentCard.deckType}</p>
                <h2 className="text-[12rem] font-bold text-[#ffb74d] mb-10 leading-none">{currentCard.id}</h2>
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`w-40 h-40 rounded-full border-4 flex items-center justify-center text-7xl ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10 animate-pulse' : 'border-[#c9b99a]/10'}`}>▶</button>
                <button onClick={() => { if(voiceRef.current) voiceRef.current.stop(); setCurrentCard(null); }} className="mt-10 opacity-30 uppercase tracking-[0.5em] text-xs">返回列表</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {cardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="min-h-[250px] flex flex-col items-center justify-center border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#ffb74d] transition-all p-6">
                    <span className="text-5xl font-bold mb-4">{card.id}</span>
                    <span className="text-[10px] opacity-20 font-bold uppercase tracking-widest">Inspect</span>
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
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
      `}</style>
    </div>
  );
}
