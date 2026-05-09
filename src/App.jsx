import React, { useState, useEffect, useRef } from 'react';
import { Howl, Howler } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_510b642674.mp3' },
  { id: 'bgm2', name: '音軌 II：深海脈動', src: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_13876d2035.mp3' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_55a2988189.mp3' },
  { id: 'bgm4', name: '音軌 IV：溶洞滴水', src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_627043815e.mp3' },
  { id: 'bgm5', name: '音軌 V：混沌祭祀', src: 'https://cdn.pixabay.com/download/audio/2024/02/14/audio_3498b8c2e1.mp3' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0.2);
  
  // 使用 useRef 確保 Sound 實體在重新渲染時不會遺失且能精準控制
  const bgmRef = useRef(null);
  const voiceRef = useRef(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線中...');
  const [scenarios, setScenarios] = useState([]);
  const [activeScenario, setActiveScenario] = useState('');
  const [activeDeckType, setActiveDeckType] = useState('調查牌組');
  
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  // 1. 初始化連線與資料
  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功');
        await refreshScenarios();
      } catch (error) {
        setDbStatus('連線失敗');
      }
    };
    initApp();
    
    // 全域解鎖：第一次點擊網頁時啟動 Howler AudioContext
    const unlock = () => {
      Howler.unload(); // 清理可能的殘留
      console.log("音訊環境已嘗試解鎖");
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('click', unlock);
    return () => window.removeEventListener('click', unlock);
  }, []);

  // 2. 刷新劇本清單
  const refreshScenarios = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      const names = new Set();
      querySnapshot.forEach(doc => names.add(doc.data().scenario));
      const list = Array.from(names);
      setScenarios(list);
      if (list.length > 0 && !activeScenario) setActiveScenario(list[0]);
    } catch (e) { console.error(e); }
  };

  // 3. 獲取過濾後的卡牌
  useEffect(() => {
    if (activeScenario) fetchFilteredCards();
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

  // 4. 背景音樂 (BGM) 實裝邏輯
  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.stop();
      bgmRef.current.unload();
    }

    if (activeBgm.src) {
      bgmRef.current = new Howl({
        src: [activeBgm.src],
        loop: true,
        volume: bgmVolume,
        html5: true, // 重要：串流大檔案
        preload: true
      });
      bgmRef.current.play();
    }

    return () => { if (bgmRef.current) bgmRef.current.unload(); };
  }, [activeBgm]);

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume(bgmVolume);
  }, [bgmVolume]);

  // 5. 語音導覽播放 (Voice)
  const playVoice = (url) => {
    if (voiceRef.current) {
      voiceRef.current.stop();
      voiceRef.current.unload();
    }

    setIsVoicePlaying(true);
    voiceRef.current = new Howl({
      src: [url],
      html5: true,
      format: ['mp3', 'wav', 'm4a', 'aac'],
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: (id, msg) => { console.error("載入失敗", msg); setIsVoicePlaying(false); },
      onplayerror: (id, msg) => {
        console.error("播放失敗", msg);
        voiceRef.current.once('unlock', () => voiceRef.current.play());
      }
    });
    voiceRef.current.play();
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const id = searchId.trim().toUpperCase();
    if (!id) return;
    setIsSearching(true);
    try {
      const docSnap = await getDoc(doc(db, "cards", id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentCard(data);
        playVoice(data.audioUrl);
      } else {
        alert("查無編號。");
      }
    } finally { setIsSearching(false); }
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme} overflow-hidden`}>
      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] z-20">
        <div className="text-xl font-bold cursor-pointer text-[var(--text-highlight)]" onClick={() => {
          const p = prompt("密語："); if (p === 'phnglui') setIsAdmin(true);
        }}>
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="text-[10px] opacity-40">{dbStatus}</span>
          <div className="flex items-center space-x-2 bg-[var(--bg-primary)] px-3 py-1 border border-[var(--border-color)]">
            <span className="text-xs">BGM</span>
            <select 
              className="bg-transparent text-xs outline-none" 
              value={activeBgm.id} 
              onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}
            >
              {bgmOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-12 h-1" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        {/* 左側選單 */}
        <div className="w-56 flex flex-col gap-6 border-r border-[var(--border-color)] pr-4 overflow-y-auto">
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 tracking-widest uppercase">Select Scenario</p>
            <div className="flex flex-col gap-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => setActiveScenario(s)} className={`p-3 text-sm text-left border transition ${activeScenario === s ? 'bg-[var(--text-highlight)] text-black border-[var(--text-highlight)]' : 'border-[var(--border-color)] opacity-60 hover:opacity-100'}`}>
                  {activeScenario === s ? '●' : '○'} {s}
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 tracking-widest uppercase">Deck Type</p>
            <div className="flex flex-col gap-2">
              {['核心卡牌', '討論牌組', '調查牌組'].map(d => (
                <button key={d} onClick={() => setActiveDeckType(d)} className={`p-3 text-xs text-left border transition ${activeDeckType === d ? 'border-[var(--text-highlight)] text-[var(--text-highlight)]' : 'border-[var(--border-color)] opacity-40'}`}>
                  {d}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* 右側主區塊 */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" placeholder="輸入卡牌編號..." 
              className="flex-1 p-4 bg-[var(--bg-panel)] border border-[var(--border-color)] text-xl outline-none focus:border-[var(--text-highlight)] transition-colors"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="px-8 bg-[var(--text-highlight)] text-black font-bold uppercase tracking-tighter">Search</button>
          </form>

          <div className="flex-1 border border-[var(--border-color)] p-8 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-20 overflow-y-auto">
            {isSearching ? (
              <div className="text-center animate-pulse">讀取深淵記錄中...</div>
            ) : currentCard ? (
              <div className="text-center w-full animate-fadeIn">
                <span className="text-[var(--text-highlight)] text-xs tracking-[0.3em] uppercase">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[10rem] font-black leading-none my-6 tracking-tighter">{currentCard.id}</h2>
                <div className="flex flex-col items-center gap-4">
                  <button 
                    onClick={() => playVoice(currentCard.audioUrl)}
                    className={`w-32 h-32 rounded-full border-2 flex items-center justify-center text-5xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] text-[var(--text-highlight)] shadow-[0_0_30px_rgba(255,183,77,0.3)] animate-pulse' : 'border-[var(--text-primary)] opacity-80 hover:opacity-100 hover:scale-105'}`}
                  >
                    {isVoicePlaying ? '⏳' : '▶'}
                  </button>
                  <button onClick={() => { if(voiceRef.current) voiceRef.current.stop(); setCurrentCard(null); }} className="text-[10px] opacity-30 hover:opacity-100 underline tracking-widest mt-4">DISMISS ARCHIVE</button>
                </div>
              </div>
            ) : (
              <div className="w-full h-full">
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {cardList.map(card => (
                    <button 
                      key={card.id} 
                      onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }}
                      className="aspect-square border border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-center text-2xl font-bold hover:border-[var(--text-highlight)] hover:text-[var(--text-highlight)] transition group"
                    >
                      <span className="group-hover:scale-125 transition-transform">{card.id}</span>
                    </button>
                  ))}
                  {cardList.length === 0 && <p className="col-span-full text-center opacity-20 py-20 italic">此區域尚無編錄檔案</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
