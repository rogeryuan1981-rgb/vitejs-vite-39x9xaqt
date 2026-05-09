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
  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  const bgmRef = useRef(null);
  const voiceRef = useRef(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線中...');
  
  const [scenarios, setScenarios] = useState([]); 
  const [deckTypes, setDeckTypes] = useState([]); 
  const [activeScenario, setActiveScenario] = useState('');
  const [activeDeckType, setActiveDeckType] = useState('');
  
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // 初始化連線
  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功');
        await refreshMetaData();
      } catch (error) {
        setDbStatus('連線失敗');
      }
    };
    initApp();
  }, []);

  const refreshMetaData = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      const scenarioSet = new Set();
      const deckTypeSet = new Set();
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.scenario) scenarioSet.add(data.scenario);
        if (data.deckType) deckTypeSet.add(data.deckType);
      });
      const sList = Array.from(scenarioSet);
      const dList = Array.from(deckTypeSet);
      setScenarios(sList);
      setDeckTypes(dList);
      if (sList.length > 0 && !activeScenario) setActiveScenario(sList[0]);
      if (dList.length > 0 && !activeDeckType) setActiveDeckType(dList[0]);
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
      setCardList(items);
    } finally { setIsSearching(false); }
  };

  // 背景音樂控制 (Howler 版本)
  const initBgm = () => {
    if (bgmRef.current) bgmRef.current.unload();
    bgmRef.current = new Howl({
      src: [activeBgm.src],
      loop: true,
      volume: bgmVolume,
      html5: true,
    });
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
    // 強制啟動 HowlerContext
    Howler.unload();
    initBgm();
  };

  // 語音播放控制 (深度偵錯版)
  const playVoice = (url) => {
    if (!isUnlocked || !url) {
      console.warn("無法啟動播放：未解鎖或無網址");
      return;
    }

    // 🕵️ 偵錯點：直接在 Console 印出網址
    console.log("------------------------------------");
    console.log("【偵錯資訊】準備播放卡牌音檔");
    console.log("音檔網址:", url);
    console.log("------------------------------------");

    if (voiceRef.current) voiceRef.current.unload();

    setIsVoicePlaying(true);
    
    // 使用 Howl 處理 Firebase 網址時，html5: true 是繞過 CORS 的關鍵
    voiceRef.current = new Howl({
      src: [url],
      html5: true, 
      format: ['mp3', 'wav', 'm4a', 'aac'],
      onplay: () => console.log("音訊開始流動..."),
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: (id, err) => {
        console.error("【載入錯誤】代碼:", err);
        setIsVoicePlaying(false);
        alert(`音檔載入失敗。網址已印在控制台，請手動檢查。`);
      },
      onplayerror: (id, err) => {
        console.error("【播放錯誤】:", err);
        voiceRef.current.once('unlock', () => voiceRef.current.play());
      }
    });
    
    voiceRef.current.play();
  };

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploadStatus(`正在編錄 ${files.length} 個檔案...`);
    let uploadedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未分類劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類牌組";
      try {
        const storageRef = ref(storage, `audios/${scen}/${deck}/${file.name}`);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await setDoc(doc(db, "cards", cardId), {
          id: cardId, scenario: scen, deckType: deck, audioUrl: downloadURL, uploadedAt: new Date().toISOString()
        });
        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / files.length) * 100));
      } catch (error) { console.error(error); }
    }
    setUploadStatus("奉獻成功！");
    await refreshMetaData();
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 3000);
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme} overflow-hidden font-sans text-[var(--text-primary)]`}>
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-95 flex flex-col items-center justify-center p-6 text-center">
          <div className="border border-[var(--text-highlight)] p-12">
            <h1 className="text-4xl font-black text-[var(--text-highlight)] mb-8 tracking-[0.5em]">系統解鎖</h1>
            <button onClick={startRitual} className="px-12 py-5 bg-[var(--text-highlight)] text-black font-black hover:scale-105 active:scale-95 transition-all">
              進入檔案庫
            </button>
          </div>
        </div>
      )}

      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] z-20">
        <div className="text-xl font-bold cursor-pointer text-[var(--text-highlight)]" onClick={() => {
          const p = prompt("請輸入密語："); if (p === 'phnglui') setIsAdmin(!isAdmin);
        }}>
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-[var(--bg-primary)] px-3 py-1 border border-[var(--border-color)] text-[10px]">
            <span>BGM</span>
            <select className="bg-transparent outline-none" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-12 h-1" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        <div className="w-56 flex flex-col gap-6 border-r border-[var(--border-color)] pr-4 overflow-y-auto">
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 uppercase tracking-widest text-center">Scenario</p>
            <div className="flex flex-col gap-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => {setActiveScenario(s); setIsAdmin(false);}} className={`p-3 text-[11px] text-left border transition ${activeScenario === s ? 'bg-[var(--text-highlight)] text-black border-[var(--text-highlight)] font-bold' : 'border-[var(--border-color)] opacity-60'}`}>
                  {s}
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 uppercase tracking-widest text-center">Deck</p>
            <div className="flex flex-col gap-2">
              {deckTypes.map(d => (
                <button key={d} onClick={() => {setActiveDeckType(d); setIsAdmin(false);}} className={`p-3 text-[11px] text-left border transition ${activeDeckType === d ? 'border-[var(--text-highlight)] text-[var(--text-highlight)] font-bold' : 'border-[var(--border-color)] opacity-40'}`}>
                  {d}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex gap-2">
            <input type="text" placeholder="輸入編號檢索..." className="flex-1 p-4 bg-[var(--bg-panel)] border border-[var(--border-color)] text-xl outline-none" value={searchId} onChange={(e) => setSearchId(e.target.value)} />
            <button onClick={() => {
              const id = searchId.trim().toUpperCase();
              if(id) {
                getDoc(doc(db, "cards", id)).then(ds => {
                  if(ds.exists()) { setIsAdmin(false); setCurrentCard(ds.data()); playVoice(ds.data().audioUrl); }
                  else alert("查無此號。");
                });
              }
            }} className="px-8 bg-[var(--text-highlight)] text-black font-bold uppercase">Seek</button>
          </div>

          <div className="flex-1 border border-[var(--border-color)] p-8 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-20 overflow-y-auto">
            {isAdmin ? (
              <div className="w-full max-w-xl text-center">
                <div className="relative border-2 border-dashed border-[var(--text-highlight)] p-16 bg-black bg-opacity-40 hover:bg-opacity-60 transition-all cursor-pointer">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <p className="text-xl font-bold">{uploadStatus || "上傳包含劇本與牌組的資料夾"}</p>
                </div>
              </div>
            ) : currentCard ? (
              <div className="text-center w-full">
                <span className="text-[var(--text-highlight)] text-[10px] tracking-widest uppercase opacity-40">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[10rem] font-black leading-none my-8 tracking-tighter">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-32 h-32 rounded-full border-2 flex items-center justify-center text-5xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] text-[var(--text-highlight)] animate-pulse' : 'border-[var(--text-primary)] hover:border-[var(--text-highlight)]'}`}
                >
                  {isVoicePlaying ? '🔊' : '▶'}
                </button>
                <button onClick={() => { if(voiceRef.current) voiceRef.current.unload(); setCurrentCard(null); }} className="block mt-10 text-[10px] opacity-30 hover:underline mx-auto">DISMISS</button>
              </div>
            ) : (
              <div className="w-full h-full">
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {cardList.map(card => (
                    <button key={card.id} onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }} className="aspect-square border border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-center text-2xl font-bold hover:border-[var(--text-highlight)] transition">{card.id}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
