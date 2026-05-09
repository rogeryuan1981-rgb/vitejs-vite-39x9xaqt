import React, { useState, useEffect } from 'react';
import { Howl } from 'howler';
import { db, storage } from './firebaseConfig'; 
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const bgmOptions = [
  { id: 'bgm1', name: '音軌 I：無名之霧', src: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_510b642674.mp3' },
  { id: 'bgm2', name: '音軌 II：深海脈動', src: '' },
  { id: 'bgm3', name: '音軌 III：遠古耳語', src: '' },
  { id: 'bgm4', name: '音軌 IV：溶洞滴水', src: '' },
  { id: 'bgm5', name: '音軌 V：混沌祭祀', src: '' },
];

export default function App() {
  const [theme, setTheme] = useState('theme-relic');
  const [activeBgm, setActiveBgm] = useState(bgmOptions[0]);
  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [bgmSound, setBgmSound] = useState(null);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線中...');
  
  // 資料篩選狀態
  const [scenarios, setScenarios] = useState([]); // 所有的劇本清單
  const [activeScenario, setActiveScenario] = useState(''); // 當前選中的劇本
  const [activeDeckType, setActiveDeckType] = useState('調查牌組'); // 當前選中的牌組類型
  
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // 播放器實體
  const [voiceSound, setVoiceSound] = useState(null);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  // 1. 初始化：檢查連線並抓取「所有劇本名稱」
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

  // 2. 從資料庫抓取所有不重複的劇本名稱
  const refreshScenarios = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      const names = new Set();
      querySnapshot.forEach(doc => names.add(doc.data().scenario));
      const scenarioList = Array.from(names);
      setScenarios(scenarioList);
      if (scenarioList.length > 0 && !activeScenario) {
        setActiveScenario(scenarioList[0]);
      }
    } catch (e) { console.error(e); }
  };

  // 3. 當劇本或牌組類型改變時，刷新卡牌清單
  useEffect(() => {
    if (activeScenario) {
      fetchFilteredCards();
    }
  }, [activeScenario, activeDeckType]);

  const fetchFilteredCards = async () => {
    setIsSearching(true);
    try {
      const q = query(
        collection(db, "cards"), 
        where("scenario", "==", activeScenario),
        where("deckType", "==", activeDeckType)
      );
      const querySnapshot = await getDocs(q);
      const items = [];
      querySnapshot.forEach((doc) => items.push(doc.data()));
      setCardList(items);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  // 4. 語音播放功能 (使用更穩定的配置)
  const playVoice = (url) => {
    // 如果正在播放，先停止舊的
    if (voiceSound) {
      voiceSound.stop();
      voiceSound.unload();
    }

    const sound = new Howl({
      src: [url],
      html5: true, // 必須開啟，否則大檔案會載入失敗
      format: ['mp3', 'wav', 'm4a'],
      autoplay: false,
      onplay: () => setIsVoicePlaying(true),
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false),
      onloaderror: (id, err) => console.error("音檔載入錯誤:", err),
      onplayerror: (id, err) => {
        console.error("播放錯誤:", err);
        sound.unlock(); // 嘗試解鎖音訊上下文
      }
    });
    
    sound.play();
    setVoiceSound(sound);
  };

  // 5. 搜尋功能
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const id = searchId.trim().toUpperCase();
    if (!id) return;
    setIsSearching(true);
    try {
      const docSnap = await getDoc(doc(db, "cards", id));
      if (docSnap.exists()) {
        setCurrentCard(docSnap.data());
      } else {
        alert("找不到此編號。");
      }
    } finally { setIsSearching(false); }
  };

  // 背景音樂 (維持原樣)
  useEffect(() => {
    if (bgmSound) bgmSound.stop();
    if (activeBgm.src) {
      const sound = new Howl({ src: [activeBgm.src], loop: true, volume: bgmVolume, html5: true });
      sound.play();
      setBgmSound(sound);
    }
    return () => { if (bgmSound) bgmSound.unload(); };
  }, [activeBgm]);

  useEffect(() => { if (bgmSound) bgmSound.volume(bgmVolume); }, [bgmVolume]);

  const handleSecretClick = () => {
    const password = prompt("密語：");
    if (password === 'phnglui') { setIsAdmin(true); }
  };

  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploadStatus("啟動奉獻程序...");
    let uploaded = 0;
    for (let file of files) {
      if (!file.type.startsWith('audio/')) continue;
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scen = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未分類劇本";
      let deck = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類牌組";
      try {
        const sRef = ref(storage, `audios/${scen}/${deck}/${file.name}`);
        await uploadBytesResumable(sRef, file);
        const url = await getDownloadURL(sRef);
        await setDoc(doc(db, "cards", cardId), {
          id: cardId, scenario: scen, deckType: deck, audioUrl: url
        });
        uploaded++;
        setUploadProgress(Math.round((uploaded / files.length) * 100));
      } catch (e) { console.error(e); }
    }
    setUploadStatus("完成");
    await refreshScenarios();
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 2000);
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme}`}>
      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="text-xl font-bold cursor-pointer text-[var(--text-highlight)]" onClick={handleSecretClick}>
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <div>狀態：{dbStatus}</div>
          <select className="bg-[var(--bg-primary)] p-1 border border-[var(--border-color)]" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
            {bgmOptions.map(bgm => <option key={bgm.id} value={bgm.id}>{bgm.name}</option>)}
          </select>
          <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-16" />
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        {/* 左側：劇本與分類篩選 */}
        <div className="w-56 flex flex-col gap-6 border-r border-[var(--border-color)] pr-4 overflow-y-auto">
          <div>
            <p className="text-[var(--text-highlight)] text-xs mb-2 opacity-60">1. 選擇劇本</p>
            <div className="flex flex-col gap-2">
              {scenarios.map(scen => (
                <button 
                  key={scen}
                  onClick={() => setActiveScenario(scen)}
                  className={`p-2 text-sm text-left border ${activeScenario === scen ? 'border-[var(--text-highlight)] bg-[var(--text-highlight)] text-black' : 'border-[var(--border-color)] hover:border-[var(--text-highlight)]'}`}
                >
                  📖 {scen}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[var(--text-highlight)] text-xs mb-2 opacity-60">2. 分類檢索</p>
            <div className="flex flex-col gap-2">
              {['核心卡牌', '討論牌組', '調查牌組'].map(deck => (
                <button 
                  key={deck}
                  onClick={() => setActiveDeckType(deck)}
                  className={`p-2 text-sm text-left border ${activeDeckType === deck ? 'border-[var(--text-highlight)] bg-[var(--bg-panel)]' : 'border-[var(--border-color)] opacity-60'}`}
                >
                  📁 {deck}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右側：搜尋與顯示 */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" placeholder="輸入編號 (如: 72B)..." 
              className="flex-1 p-3 bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] outline-none"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="px-6 bg-[var(--text-highlight)] text-black font-bold">檢索</button>
          </form>
          
          <div className="flex-1 border border-[var(--border-color)] p-6 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-20 overflow-y-auto">
            {isSearching ? (
              <p className="animate-pulse">正在讀取...</p>
            ) : currentCard ? (
              <div className="text-center">
                <p className="text-[var(--text-highlight)] text-sm mb-2">{currentCard.scenario} / {currentCard.deckType}</p>
                <h2 className="text-8xl font-bold mb-10 tracking-tighter">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-28 h-28 rounded-full border-4 flex items-center justify-center text-4xl transition-all ${isVoicePlaying ? 'border-[var(--text-highlight)] animate-pulse shadow-[0_0_20px_var(--text-highlight)]' : 'border-[var(--text-primary)]'}`}
                >
                  {isVoicePlaying ? '🔊' : '▶️'}
                </button>
                <button onClick={() => {if(voiceSound)voiceSound.stop(); setCurrentCard(null);}} className="block mt-10 text-xs opacity-40 hover:underline mx-auto">關閉檔案</button>
              </div>
            ) : isAdmin ? (
              <div className="text-center w-full max-w-md p-10 border-2 border-dashed border-[var(--border-color)] relative">
                <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                <p className="text-xl mb-2">📁 批次上傳劇本資料夾</p>
                <p className="text-xs opacity-50">{uploadStatus || "支援多層級結構"}</p>
              </div>
            ) : (
              <div className="w-full">
                <p className="text-xs text-[var(--text-highlight)] mb-4">發現 {cardList.length} 份關聯檔案：</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {cardList.map(card => (
                    <div 
                      key={card.id}
                      onClick={() => { setCurrentCard(card); playVoice(card.audioUrl); }}
                      className="p-3 border border-[var(--border-color)] bg-[var(--bg-panel)] cursor-pointer hover:border-[var(--text-highlight)] hover:bg-[var(--bg-primary)] transition text-center"
                    >
                      <div className="text-lg font-bold">{card.id}</div>
                    </div>
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
