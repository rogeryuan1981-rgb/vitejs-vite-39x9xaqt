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

  // 初始化
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
      setCardList(items.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true, sensitivity: 'base'})));
    } finally { setIsSearching(false); }
  };

  const initBgm = () => {
    if (bgmRef.current) {
      bgmRef.current.stop();
      bgmRef.current.unload();
    }
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
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未分類劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類牌組";
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
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#0d0d0d] text-[#d4c5a9] font-serif selection:bg-[#ffb74d] selection:text-black">
      {/* 噪點遮罩質感 */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>

      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="relative p-20 border border-[#2a2a2a] bg-[#050505]">
            <div className="absolute inset-0 border border-[#ffb74d] opacity-20 scale-[1.02]"></div>
            <h1 className="text-5xl font-black text-[#ffb74d] mb-12 tracking-[1em] drop-shadow-[0_0_15px_rgba(255,183,77,0.5)]">禁忌檔案庫</h1>
            <button onClick={startRitual} className="relative px-16 py-6 border-2 border-[#ffb74d] text-[#ffb74d] text-xl font-bold hover:bg-[#ffb74d] hover:text-black transition-all duration-700 tracking-[0.5em] overflow-hidden group">
              <span className="relative z-10">啟動檢索終端</span>
              <div className="absolute inset-0 bg-[#ffb74d] translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center px-8 py-5 border-b border-[#2a2a2a] bg-[#0a0a0a] shadow-2xl z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 border border-[#ffb74d] flex items-center justify-center text-xs rotate-45 text-[#ffb74d]">👁️</div>
          <div className="text-2xl font-bold text-[#ffb74d] cursor-pointer tracking-widest hover:brightness-125 transition-all" onClick={() => {
            const p = prompt("請輸入密語："); if (p === '0943') setIsAdmin(!isAdmin);
          }}>禁忌檔案庫 {isAdmin && <span className="text-[10px] ml-2 text-red-500 animate-pulse">[管理模式]</span>}</div>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-3 px-4 py-2 border border-[#2a2a2a] bg-black text-[11px]">
            <span className="opacity-40 text-[#ffb74d] uppercase tracking-tighter">BGM 頻道</span>
            <select className="bg-transparent outline-none text-[#ffb74d] font-bold" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>)}
            </select>
            <div className="w-[1px] h-4 bg-[#2a2a2a] mx-2"></div>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-24 h-1 accent-[#ffb74d] hover:scale-x-105 transition-transform" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-8 gap-8 overflow-hidden relative">
        {/* 左側選單：分類連動 */}
        <div className="w-64 flex flex-col gap-8 overflow-y-auto pr-2 custom-scrollbar">
          <section>
            <p className="text-[#ffb74d] text-xs mb-4 opacity-40 uppercase tracking-[0.3em] font-black border-l-2 border-[#ffb74d] pl-3">劇本清單</p>
            <div className="flex flex-col gap-3">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`group relative p-4 text-sm text-left border transition-all duration-300 ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold translate-x-2' : 'border-[#2a2a2a] bg-[#111] hover:border-[#ffb74d]/50 hover:translate-x-1'}`}>
                  {s}
                  {activeScenario === s && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-black/30 text-xs">◆</div>}
                </button>
              ))}
            </div>
          </section>
          
          <section>
            <p className="text-[#ffb74d] text-xs mb-4 opacity-40 uppercase tracking-[0.3em] font-black border-l-2 border-[#ffb74d] pl-3">檔案分類</p>
            <div className="flex flex-col gap-3">
              {availableDecks.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-4 text-xs text-left border transition-all duration-300 ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] bg-[#ffb74d]/5 font-bold shadow-[inset_0_0_10px_rgba(255,183,77,0.1)]' : 'border-[#2a2a2a] bg-[#111] opacity-60 hover:opacity-100 hover:border-[#ffb74d]/30'}`}>{d}</button>
              ))}
              {availableDecks.length === 0 && <p className="text-[10px] text-center opacity-20 italic p-4 border border-dashed border-[#2a2a2a]">無分類資料</p>}
            </div>
          </section>
        </div>

        {/* 右側內容區塊 */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex gap-4 group">
            <div className="relative flex-1">
              <input type="text" placeholder="輸入編號進行深度檢索..." className="w-full p-5 bg-[#0a0a0a] border border-[#2a2a2a] text-xl outline-none focus:border-[#ffb74d] focus:bg-black transition-all duration-500 placeholder:opacity-20 placeholder:italic" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] opacity-20 font-mono tracking-tighter">SEARCH_MODE_ACTIVE</div>
            </div>
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("此紀錄未被編錄。");
                });
              }
            }} className="px-12 bg-[#ffb74d] text-black font-black uppercase hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,183,77,0.2)]">檢索</button>
          </div>

          <div className="flex-1 border border-[#2a2a2a] p-10 flex flex-col items-center justify-center relative bg-[#0a0a0a] bg-[radial-gradient(circle_at_center,_rgba(255,183,77,0.03)_0%,_transparent_70%)] overflow-hidden shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
            
            {isAdmin ? (
              <div className="w-full max-w-2xl text-center animate-fadeIn">
                <div className="relative border-2 border-dashed border-[#ffb74d]/30 p-20 bg-[#050505] group hover:border-[#ffb74d] hover:bg-[#080808] transition-all duration-1000 cursor-pointer">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="flex flex-col items-center gap-6">
                    <div className="text-7xl group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 opacity-60">📜</div>
                    <p className="text-2xl font-bold tracking-[0.2em] text-[#ffb74d]">{uploadStatus || "上傳古神資料夾"}</p>
                    {currentUploadingFile && <p className="text-xs font-mono text-[#ffb74d] animate-pulse">解析中: {currentUploadingFile}</p>}
                  </div>
                  {uploadProgress > 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-[#1a1a1a]">
                      <div className="h-full bg-[#ffb74d] shadow-[0_0_20px_#ffb74d] transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  )}
                </div>
                <button onClick={() => setIsAdmin(false)} className="mt-12 text-[10px] opacity-20 hover:opacity-100 hover:text-[#ffb74d] transition-all tracking-[0.5em] border-b border-transparent hover:border-[#ffb74d]">關閉管理控制終端</button>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full animate-fadeIn flex flex-col items-center">
                <div className="mb-4 flex items-center gap-6 opacity-40">
                  <div className="h-[1px] w-20 bg-[#ffb74d]"></div>
                  <span className="text-xs tracking-[0.8em] font-black">{currentCard.scenario} / {currentCard.deckType}</span>
                  <div className="h-[1px] w-20 bg-[#ffb74d]"></div>
                </div>
                <h2 className="text-[12rem] font-black leading-none my-12 tracking-tighter text-[#ffb74d] drop-shadow-[0_0_30px_rgba(255,183,77,0.3)] select-none">{currentCard.id}</h2>
                
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`group relative w-40 h-40 rounded-full border-4 flex items-center justify-center transition-all duration-1000 ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/10' : 'border-[#d4c5a9]/20 hover:border-[#ffb74d] hover:scale-110'}`}>
                  <div className={`text-6xl transition-all duration-500 ${isVoicePlaying ? 'scale-125 text-[#ffb74d]' : 'group-hover:text-[#ffb74d]'}`}>
                    {isVoicePlaying ? '⚡' : '▶'}
                  </div>
                  {isVoicePlaying && (
                    <div className="absolute inset-0 rounded-full border-2 border-[#ffb74d] animate-ping opacity-20"></div>
                  )}
                </button>

                <button onClick={() => { if(voiceRef.current) voiceRef.current.unload(); setCurrentCard(null); }} className="mt-16 px-10 py-3 border border-[#2a2a2a] text-[10px] opacity-30 hover:opacity-100 hover:bg-[#ffb74d] hover:text-black hover:border-[#ffb74d] transition-all tracking-[0.4em] uppercase">Dismiss</button>
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto custom-scrollbar pr-4">
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {cardList.map(card => (
                    <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="aspect-[4/5] border border-[#2a2a2a] bg-[#111] flex flex-col items-center justify-center gap-4 group hover:border-[#ffb74d] hover:-translate-y-2 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-500 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-[#ffb74d] -translate-x-full group-hover:translate-x-0 transition-transform duration-700"></div>
                      <span className="text-3xl font-black group-hover:scale-110 group-hover:text-[#ffb74d] transition-all duration-500 select-none">{card.id}</span>
                      <div className="text-[9px] opacity-20 group-hover:opacity-100 transition-opacity tracking-widest uppercase">Inspect</div>
                    </button>
                  ))}
                  {cardList.length === 0 && (
                    <div className="col-span-full h-full flex flex-col items-center justify-center opacity-10">
                      <div className="text-9xl mb-8">🌑</div>
                      <p className="text-2xl tracking-[1em]">此處空無一物</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2a2a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ffb74d; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.8s ease-out forwards; }
      `}</style>
    </div>
  );
}
