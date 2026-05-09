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
  const [adminClickCount, setAdminClickCount] = useState(0);
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

  // 初始化與讀取劇本
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
      if (p === '0943') { // 密碼改為 0943
        setIsAdmin(!isAdmin);
      }
      setAdminClickCount(0);
    } else {
      setAdminClickCount(newCount);
      setTimeout(() => setAdminClickCount(0), 3000);
    }
  };

  // 劇本連動邏輯
  useEffect(() => {
    if (activeScenario) {
      // 切換劇本時停止音訊
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

  // 關閉檔案並停止播放
  const dismissCard = () => {
    if (voiceRef.current) voiceRef.current.stop();
    setCurrentCard(null);
  };

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploadStatus('初始化中');
    let uploadedCount = 0;
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
    const totalFiles = audioFiles.length;

    for (let file of audioFiles) {
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未命名劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類檔案";
      setCurrentUploadingFile(cardId);
      setUploadStatus(`同步中`);
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
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 5000);
  };

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#0a0a0a] text-[#c9b99a] font-sans selection:bg-[#ffb74d] selection:text-black text-lg">
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-[9999] bg-[url('https://www.transparenttextures.com/patterns/micro-carbon.png')]"></div>
      
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-10 text-center">
          <div className="relative p-24 border border-[#222] bg-[#050505]">
            <h1 className="text-7xl font-bold text-[#ffb74d] mb-16 tracking-[1.2em]">禁忌檔案庫</h1>
            <button onClick={startRitual} className="px-24 py-10 border-2 border-[#ffb74d] text-[#ffb74d] text-3xl font-bold hover:bg-[#ffb74d] hover:text-black transition-all duration-700 tracking-[0.8em] uppercase">進入系統</button>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center px-12 py-8 border-b border-[#1a1a1a] bg-[#050505] z-20">
        <div className="flex items-center gap-8">
          <div className="w-14 h-14 border border-[#ffb74d]/40 flex items-center justify-center text-2xl rotate-45 text-[#ffb74d]">👁️</div>
          <div className="text-4xl font-bold text-[#ffb74d] cursor-pointer tracking-widest" onClick={handleAdminTrigger}>
            禁忌檔案庫 {isAdmin && <span className="text-sm ml-4 text-red-500 animate-pulse uppercase">[管理模式]</span>}
          </div>
        </div>
        <div className="flex items-center space-x-10">
          <div className="flex items-center gap-6 px-8 py-4 border border-[#1a1a1a] bg-black text-sm">
            <span className="opacity-40 text-[#ffb74d] uppercase tracking-widest font-bold">BGM 頻道</span>
            <select className="bg-transparent outline-none text-[#ffb74d] font-bold" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id} className="bg-[#050505]">{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.01" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-40 h-1 accent-[#ffb74d]" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-12 gap-12 overflow-hidden relative">
        <div className="w-80 flex flex-col gap-12 overflow-y-auto pr-6 custom-scrollbar">
          <section>
            <p className="text-[#ffb74d] text-xs mb-8 opacity-40 uppercase tracking-[0.4em] font-bold border-l-4 border-[#ffb74d] pl-6">劇本清單</p>
            <div className="flex flex-col gap-4">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`p-6 text-lg text-left border transition-all duration-500 ${activeScenario === s ? 'bg-[#ffb74d] text-black border-[#ffb74d] font-bold' : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#ffb74d]/60'}`}>{s}</button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[#ffb74d] text-xs mb-8 opacity-40 uppercase tracking-[0.4em] font-bold border-l-4 border-[#ffb74d] pl-6">檔案分類</p>
            <div className="flex flex-col gap-4">
              {availableDecks.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-6 text-base text-left border transition-all duration-500 ${activeDeckType === d ? 'border-[#ffb74d] text-[#ffb74d] bg-[#ffb74d]/5 font-bold' : 'border-[#1a1a1a] bg-[#0a0a0a] opacity-50 hover:opacity-100 hover:border-[#ffb74d]/40'}`}>{d}</button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-10 overflow-hidden">
          <div className="flex gap-6">
            <input type="text" placeholder="輸入編號進行深度檢索..." className="flex-1 p-8 bg-[#050505] border border-[#1a1a1a] text-3xl outline-none focus:border-[#ffb74d]" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("未編錄編號。");
                });
              }
            }} className="px-20 bg-[#ffb74d] text-black font-bold uppercase text-xl">檢索</button>
          </div>

          <div className="flex-1 border border-[#1a1a1a] p-16 flex flex-col items-center justify-center relative bg-[#050505] shadow-[inset_0_0_120px_rgba(0,0,0,0.8)]">
            {isAdmin ? (
              <div className="w-full max-w-3xl text-center">
                <div className="relative border-2 border-dashed border-[#ffb74d]/20 p-28 bg-[#080808]">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="flex flex-col items-center gap-10">
                    <div className="text-9xl opacity-40">📂</div>
                    <p className="text-4xl font-bold tracking-[0.3em] text-[#ffb74d]">{uploadStatus || "上傳音檔資料夾"}</p>
                    {currentUploadingFile && <p className="text-sm font-mono text-[#ffb74d] animate-pulse">處理中: {currentUploadingFile}</p>}
                  </div>
                  {uploadProgress > 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-2 bg-black/50">
                      <div className="h-full bg-[#ffb74d]" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  )}
                </div>
                <button onClick={() => setIsAdmin(false)} className="mt-20 text-xs opacity-20 hover:opacity-100 hover:text-[#ffb74d] transition-all tracking-[0.6em] uppercase">關閉管理模式</button>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full flex flex-col items-center">
                <div className="mb-10 flex items-center gap-10 opacity-30">
                  <div className="h-[1px] w-32 bg-[#ffb74d]"></div>
                  <span className="text-sm tracking-[1em] font-bold uppercase">{currentCard.scenario} / {currentCard.deckType}</span>
                  <div className="h-[1px] w-32 bg-[#ffb74d]"></div>
                </div>
                <h2 className="text-[14rem] font-bold leading-none my-16 tracking-tighter text-[#ffb74d] drop-shadow-[0_10px_50px_rgba(255,183,77,0.4)]">{currentCard.id}</h2>
                <button onClick={() => playVoice(currentCard.audioUrl)} className={`relative w-60 h-60 rounded-full border-4 flex items-center justify-center transition-all duration-1000 ${isVoicePlaying ? 'border-[#ffb74d] bg-[#ffb74d]/5' : 'border-[#c9b99a]/10 hover:border-[#ffb74d]'}`}>
                  <div className="text-8xl">{isVoicePlaying ? '⚡' : '▶'}</div>
                </button>
                <button onClick={dismissCard} className="mt-24 px-16 py-6 border border-[#1a1a1a] text-sm opacity-20 hover:opacity-100 hover:bg-[#ffb74d] hover:text-black tracking-[0.5em] uppercase font-bold">返回列表</button>
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto custom-scrollbar pr-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
                  {cardList.map(card => (
                    <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="aspect-[4/5] border border-[#1a1a1a] bg-[#080808] flex flex-col items-center justify-center p-10 group hover:border-[#ffb74d] hover:-translate-y-4 transition-all duration-700">
                      <span className="text-5xl font-bold group-hover:text-[#ffb74d] transition-all duration-700">{card.id}</span>
                      <div className="mt-10 text-xs opacity-10 group-hover:opacity-100 transition-all tracking-[0.4em] uppercase font-bold">檢視檔案</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        /* 優化中文字體顯示與粗體相容性 */
        :global(body) {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", "Heiti TC", "Noto Sans CJK TC", sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ffb74d; }
      `}</style>
    </div>
  );
}
