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
      <div className="fixed inset-0 pointer-events-none opacity-[0.05] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')]"></div>
      
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="relative p-16 border border-[#222] bg-[#050505]">
            <h1 className="text-5xl md:text-6xl font-bold text-[#ffb74d] mb-12 tracking-[1em]">禁忌檔案庫</h1>
            <button onClick={startRitual} className="px-16 py-6 border-2 border-[#ffb74d] text-[#ffb74d] text-xl font-bold tracking-[0.5em]">啟動檢索</button>
          </div>
        </div>
      )}

      {/* Header - iPad 適配高度 */}
      <header className="flex-none flex justify-between items-center px-8 py-6 border-b border-[#1a1a1a] bg-[#050505] z-20">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 border border-[#ffb74d]/40 flex items-center justify-center text-xl rotate-45 text-[#ffb74d]">👁️</div>
          <div className="text-3xl font-bold text-[#ffb74d] cursor-pointer tracking-widest" onClick={handleAdminTrigger}>
            禁忌檔案庫 {isAdmin && <span className="text-xs ml-2 text-red-500 animate-pulse">[ADMIN]</span>}
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-4 px-6 py-3 border border-[#1a1a1a] bg-black text-xs">
            <span className="opacity-30 text-[#ffb74d] uppercase font-bold">BGM</span>
            <select className="bg-transparent outline-none text-[#ffb74d]" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-[#050505]">{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-32 h-1 accent-[#ffb74d]" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-8 gap-8 overflow-hidden relative min-h-0">
        {/* 左選單 - 寬度微調 */}
        <div className="w-64 md:w-72 flex flex-col gap-8 overflow-y-auto pr-4 custom-scrollbar flex-none">
          <section>
            <p className="text-[#ffb74d] text-[10px] mb-6 opacity-40 uppercase tracking-[0.4em] font-bold border-l-4 border-[#ffb74d] pl-4">劇本清單</p>
            <div className="flex flex-col gap-4">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`p-5 text-xl text-left border transition-all ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] bg-[#0a0a0a]'}`}>{s}</button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[#ffb74d] text-[10px] mb-6 opacity-40 uppercase tracking-[0.4em] font-bold border-l-4 border-[#ffb74d] pl-4">檔案分類</p>
            <div className="flex flex-col gap-4">
              {availableDecks.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-5 text-base text-left border transition-all ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] bg-[#ffb74d]/5 font-bold' : 'border-[#1a1a1a] bg-[#0a0a0a] opacity-50'}`}>{d}</button>
              ))}
            </div>
          </section>
        </div>

        {/* 右內容區 */}
        <div className="flex-1 flex flex-col gap-6 min-w-0 overflow-hidden">
          <div className="flex-none flex gap-4">
            <input type="text" placeholder="輸入編號進行深度檢索..." className="flex-1 p-6 bg-[#050505] border border-[#1a1a1a] text-2xl outline-none focus:border-[#ffb74d]" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(doc(db, "cards", id))).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("此紀錄未被編錄。");
                });
              }
            }} className="px-12 bg-[#ffb74d] text-black font-bold uppercase text-lg">Seek</button>
          </div>

          <div className="flex-1 border border-[#1a1a1a] p-8 relative bg-[#050505] overflow-y-auto custom-scrollbar min-h-0">
            {isAdmin ? (
              <div className="w-full max-w-2xl mx-auto text-center py-10">
                <div className="relative border-2 border-dashed border-[#ffb74d]/20 p-20 bg-[#080808]">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <p className="text-2xl font-bold text-[#ffb74d]">{uploadStatus || "奉獻資料夾"}</p>
                </div>
                <button onClick={() => setIsAdmin(false)} className="mt-10 text-xs opacity-20 hover:opacity-100">Exit Admin</button>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full flex flex-col items-center py-10 animate-fadeIn">
                <span className="text-sm tracking-[1em] font-bold uppercase opacity-30 mb-8">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[12rem] md:text-[14rem] font-bold leading-none my-12 text-[#ffb74d] select-none break-all">{currentCard.id}</h2>
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`relative w-48 h-48 rounded-full border-4 flex items-center justify-center transition-all ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10' : 'border-[#c9b99a]/10 hover:border-[#ffb74d]'}`}>
                  <div className="text-8xl">{isVoicePlaying ? '⚡' : '▶'}</div>
                </button>
                <button onClick={dismissCard} className="mt-20 px-12 py-5 border border-[#1a1a1a] text-sm opacity-20 hover:opacity-100 tracking-[0.5em] uppercase font-bold">Dismiss</button>
              </div>
            ) : (
              /* 修正 iPad 網格 - 根據截圖顯示，建議列數固定在 2~4 欄 */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {cardList.map(card => (
                  <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} 
                    className="min-h-[300px] flex flex-col items-center justify-center border border-[#1a1a1a] bg-[#080808] p-8 group hover:border-[#ffb74d] transition-all">
                    <span className="text-5xl md:text-6xl font-bold group-hover:text-[#ffb74d] transition-all break-words w-full text-center">{card.id}</span>
                    <div className="mt-8 text-xs opacity-10 group-hover:opacity-100 tracking-[0.4em] font-bold uppercase">Inspect</div>
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
          background-color: #050505;
          margin: 0;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ffb74d; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out forwards; }
      `}</style>
    </div>
  );
}
