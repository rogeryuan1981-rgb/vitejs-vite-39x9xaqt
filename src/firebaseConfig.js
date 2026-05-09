import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// ⚠️ 請將大括號裡面的內容，完全替換成你在 Firebase 複製的那段 firebaseConfig
const firebaseConfig = {
  apiKey: "AIzaSyBkqTx_tA-I7a4kRteuKMYzZe8suG9JS9Y",
  authDomain: "cthulhu-guide.firebaseapp.com",
  projectId: "cthulhu-guide",
  storageBucket: "cthulhu-guide.firebasestorage.app",
  messagingSenderId: "537829910735",
  appId: "1:537829910735:web:16a3c2637ea2edd7fdafba"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 匯出我們需要用到的服務，讓其他檔案可以使用
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
