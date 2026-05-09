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
  
  // 管理員與連線狀態
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbStatus, setDbStatus] = useState('連線中...');
  
  // 資料狀態
  const [searchId, setSearchId] = useState('');
  const [currentCard, setCurrentCard] = useState(null);
  const [cardList, setCardList] = useState([]); // 當前分類的卡牌清單
  const [activeCategory, setActiveCategory] = useState('調查牌組'); // 預設分類
  const [isSearching, setIsSearching] = useState(false);

  // 上傳狀態
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // 播放器狀態
  const [voiceSound, setVoiceSound] = useState(null);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  // 1. 初始化連線與讀取預設分類
  useEffect(() => {
    const initApp = async () => {
      try {
        await getDocs(collection(db, "system_check"));
        setDbStatus('連線成功 (終端已連線)');
        fetchCategoryData('調查牌組'); // 初始載入
      } catch (error) {
        setDbStatus('連線失敗 (迷失於虛空)');
      }
    };
    initApp();
  }, []);

  // 2. 根據分類抓取資料
  const fetchCategoryData = async (category) => {
    setIsSearching(true);
    setActiveCategory(category);
    setCurrentCard(null);
    try {
      const q = query(collection(db, "cards"), where("deckType", "==", category));
      const querySnapshot = await getDocs(q);
      const items = [];
      querySnapshot.forEach((doc) => {
        items.push(doc.data());
      });
      setCardList(items);
    } catch (error) {
      console.error("讀取分類失敗:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // 3. 檢索功能 (精確匹配)
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const id = searchId.trim().toUpperCase();
    if (!id) return;

    setIsSearching(true);
    if (voiceSound) voiceSound.stop();

    try {
      const docRef = doc(db, "cards", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setCurrentCard(docSnap.data());
      } else {
        alert(`編號 ${id} 不存在於禁忌檔案中。`);
      }
    } catch (error) {
      console.error("檢索錯誤:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // 背景音樂與語音邏輯 (保持原有邏輯)
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

  const playVoice = (url) => {
    if (voiceSound) voiceSound.stop();
    const sound = new Howl({
      src: [url], html5: true,
      onplay: () => setIsVoicePlaying(true),
      onend: () => setIsVoicePlaying(false),
      onstop: () => setIsVoicePlaying(false)
    });
    sound.play();
    setVoiceSound(sound);
  };

  const handleSecretClick = () => {
    const password = prompt("請輸入古老密語：");
    if (password === 'phnglui') { setIsAdmin(true); alert("管理權限已開啟。"); }
  };

  // 上傳功能 (保持原有路徑拆解邏輯)
  const handleFolderSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    let validFilesCount = 0;
    for (let i = 0; i < files.length; i++) if (files[i].type.startsWith('audio/')) validFilesCount++;
    setUploadStatus(`準備奉獻 ${validFilesCount} 份檔案...`);
    let uploadedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;
      const cardId = file.name.split('.')[0].toUpperCase();
      const pathParts = file.webkitRelativePath.split('/');
      let scenarioName = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : "未分類劇本";
      let deckType = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "未分類牌組";

      try {
        const storageRef = ref(storage, `audios/${scenarioName}/${deckType}/${file.name}`);
        await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await setDoc(doc(db, "cards", cardId), {
          id: cardId, fileName: file.name, scenario: scenarioName,
          deckType: deckType, audioUrl: downloadURL, uploadedAt: new Date().toISOString()
        });
        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / validFilesCount) * 100));
      } catch (e) { console.error(e); }
    }
    setUploadStatus(`完成！已上傳 ${uploadedCount} 個檔案。`);
    fetchCategoryData(activeCategory); // 刷新當前列表
    setTimeout(() => { setUploadStatus(''); setUploadProgress(0); }, 3000);
  };

  return (
    <div className={`w-screen h-screen flex flex-col ${theme}`}>
      <header className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="text-xl font-bold cursor-pointer select-none text-[var(--text-highlight)]" onClick={handleSecretClick}>
          👁️ 禁忌檔案庫 {isAdmin && " [管理模式]"}
        </div>
        <div className="flex items-center space-x-6 text-sm">
          <div className="opacity-80">狀態：{dbStatus}</div>
          <div className="flex items-center space-x-2">
            <span>🎵</span>
            <select className="bg-[var(--bg-primary)] border border-[var(--border-color)] p-1 outline-none" value={activeBgm.id} onChange={(e) => setActiveBgm(bgmOptions.find(b => b.id === e.target.value))}>
              {bgmOptions.map(bgm => <option key={bgm.id} value={bgm.id}>{bgm.name}</option>)}
            </select>
            <input type="range" min="0" max="1" step="0.05" value={bgmVolume} onChange={(e) => setBgmVolume(parseFloat(e.target.value))} className="w-20" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        {/* 左側分類 */}
        <div className="w-48 flex flex-col gap-4 border-r border-[var(--border-color)] pr-4">
          {['核心卡牌', '討論牌組', '調查牌組'].map(cat => (
            <button 
              key={cat}
              onClick={() => fetchCategoryData(cat)}
              className={`p-3 text-left border border-[var(--border-color)] transition ${activeCategory === cat ? 'bg-[var(--text-highlight)] text-black font-bold' : 'bg-[var(--bg-panel)] hover:border-[var(--text-highlight)]'}`}
            >
              📁 {cat}
            </button>
          ))}
        </div>

        {/* 右側內容 */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" placeholder="輸入編號檢索，或從下方清單選取..." 
              className="flex-1 p-3 bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--text-highlight)] text-lg outline-none"
              value={searchId} onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="px-6 bg-[var(--text-highlight)] text-black font-bold hover:opacity-80">檢索</button>
          </form>
          
          <div className="flex-1 border border-[var(--border-color)] p-6 flex flex-col items-center justify-center relative bg-[var(--bg-panel)] bg-opacity-30 overflow-y-auto">
            
            {isSearching ? (
              <p className="animate-pulse text-[var(--text-highlight)]">正在檢索深淵檔案...</p>
            ) : currentCard ? (
              <div className="text-center animate-fadeIn">
                <div className="mb-2 text-[var(--text-highlight)] text-sm">{currentCard.scenario} / {currentCard.deckType}</div>
                <h2 className="text-7xl font-bold mb-8">{currentCard.id}</h2>
                <button 
                  onClick={() => playVoice(currentCard.audioUrl)}
                  className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-3xl ${isVoicePlaying ? 'border-[var(--text-highlight)] animate-ping' : 'border-[var(--text-primary)]'}`}
                >
                  {isVoicePlaying ? '🔊' : '▶️'}
                </button>
                <button onClick={() => setCurrentCard(null)} className="block mt-8 text-sm opacity-50 hover:underline mx-auto">返回清單</button>
              </div>
            ) : isAdmin ? (
              <div className="text-center w-full max-w-lg">
                <h2 className="text-2xl text-[var(--text-highlight)] mb-6 font-bold">管理員控制台</h2>
                <div className="relative p-10 border-2 border-dashed border-[var(--border-color)] hover:border-[var(--text-highlight)] bg-[var(--bg-panel)] min-h-[200px] flex items-center justify-center">
                  <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="text-center">
                    {uploadStatus ? <p className="font-bold text-[var(--text-highlight)]">{uploadStatus}</p> : <p>📁 點擊此處奉獻整包資料夾</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full">
                <p className="text-sm text-[var(--text-highlight)] mb-4">現有檔案清單 ({activeCategory})：</p>
                <div className="grid grid-cols-4 gap-4">
                  {cardList.length > 0 ? cardList.map(card => (
                    <div 
                      key={card.id}
                      onClick={() => setCurrentCard(card)}
                      className="p-4 border border-[var(--border-color)] bg-[var(--bg-panel)] cursor-pointer hover:border-[var(--text-highlight)] text-center transition"
                    >
                      <div className="text-xl font-bold">{card.id}</div>
                      <div className="text-[10px] opacity-40 truncate">{card.scenario}</div>
                    </div>
                  )) : <p className="col-span-4 opacity-30 text-center py-10">此分類目前無編錄檔案</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
