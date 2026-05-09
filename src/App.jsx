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
  const [isUnlocked, setIsUnlocked] = useState(false); // 追蹤音訊是否已解鎖
  
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

  // 初始化與解鎖
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
  }, []);

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

  // 手動啟動儀式：解鎖瀏覽器音訊限制
  const startRitual = () => {
    setIsUnlocked(true);
    // 初始化 BGM
    initBgm();
  };

  const initBgm = () => {
    if (bgmRef.current) {
      bgmRef.current.stop();
      bgmRef.current.unload();
    }
    bgmRef.current = new Howl({
      src: [activeBgm.src],
      loop: true,
      volume: bgmVolume,
      html5: true,
      onplayerror: function() {
        bgmRef.current.once('unlock', function() {
          bgmRef.current.play();
        });
      }
    });
    bgmRef.current.play();
  };

  useEffect(() => {
    if (isUnlocked) initBgm();
  }, [activeBgm]);

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume(bgmVolume);
  }, [bgmVolume]);

  // 語音播放
  const playVoice = (url) => {
    if (!isUnlocked) {
      alert("請先點擊『啟動檔案庫儀式』以解除音訊禁制。");
      return;
    }

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
      onloaderror: (id, msg) => { 
        console.error("載入失敗", msg); 
        setIsVoicePlaying(false);
        alert("音訊檔案載入失敗，可能受到 CORS 限制或網路不穩。");
      },
      onplayerror: (id, msg) => {
        voiceRef.current.once('unlock', () => voiceRef.current.play());
      }
    });
    voiceRef.current.play();
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme} overflow-hidden font-sans`}>
      
      {!isUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex flex-col items-center justify-center">
          <div className="p-10 border-2 border-[var(--text-highlight)] text-center max-w-sm">
            <h1 className="text-3xl font-bold text-[var(--text-highlight)] mb-6 tracking-tighter">檢索終端已就緒</h1>
            <p className="text-sm opacity-60 mb-8 leading-relaxed">偵測到音訊環境受阻，請點擊下方按鈕以啟動檔案庫連結儀式，解鎖語音導覽與背景音軌。</p>
            <button 
              onClick={startRitual}
              className="px-10 py-4 bg-[var(--text-highlight)] text-black font-bold hover:scale-105 transition-transform"
            >
              啟動檔案庫儀式
            </button>
          </div>
        </div>
      )}

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
        <div className="w-56 flex flex-col gap-6 border-r border-[var(--border-color)] pr-4 overflow-y-auto">
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 tracking-widest uppercase">Scenario</p>
            <div className="flex flex-col gap-2">
              {scenarios.map(s => (
                <button key={s} onClick={() => setActiveScenario(s)} className={`p-3 text-xs text-left border transition ${activeScenario === s ? 'bg-[var(--text-highlight)] text-black border-[var(--text-highlight)] font-bold' : 'border-[var(--border-color)] opacity-60'}`}>
                  {s}
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="text-[var(--text-highlight)] text-[10px] mb-3 opacity-50 tracking-widest uppercase">Deck</p>
            <div className="flex flex-col gap-2">
              {['核心卡牌', '討論牌組', '調查牌組'].map(d => (
                <button key={d} onClick={() => setActiveDeckType(d)} className={`p-3 text-[10px] text-left border transition ${activeDeckType === d ? 'border-[var(--text-highlight)] text-[var(--text-highlight)]' : 'border-[var(--border-color)] opacity-40'}`}>
                  {d}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
            <input 
              type="text" placeholder="輸入編號..." 
              className="flex-1 p-4 bg-[var(--bg-panel)] border border-[var(--border-color)] text-xl outline-none"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="px-8 bg-[var(--text-highlight)] text-black font-bold uppercase">Search</button>
          </form>

          <div className="flex-1 border border-[var(--border-color)] p-8 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-20 overflow-y-auto">
            {isSearching ? (
              <div className="text-center animate-pulse">讀取中...</div>
            ) : currentCard ? (
              <div className="text-center w-full">
                <span className="text-[var(--text-highlight)] text-[10px] tracking-widest uppercase opacity-60">{currentCard.scenario} / {currentCard.deckType}</span>
                <h2 className="text-[12rem] font-black leading-none my-8 tracking-tighter">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-32 h-32 rounded-full border-2 flex items-center justify-center text-5xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] text-[var(--text-highlight)] animate-pulse' : 'border-[var(--text-primary)]'}`}
                >
                  {isVoicePlaying ? '⏳' : '▶'}
                </button>
                <button onClick={() => setCurrentCard(null)} className="block mt-10 text-[10px] opacity-30 hover:underline mx-auto">DISMISS</button>
              </div>
            ) : (
              <div className="w-full h-full">
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {cardList.map(card => (
                    <button 
                      key={card.id} 
                      onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }}
                      className="aspect-square border border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-center text-2xl font-bold hover:border-[var(--text-highlight)] transition"
                    >
                      {card.id}
                    </button>
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
