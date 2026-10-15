// Cấu hình tài khoản Firebase của bạn
const firebaseConfig = {
    apiKey: "AIzaSyDyp-B-qMRD1vKbNlXL0t0VDyHsm5PM9lY",
    authDomain: "fckhuong-14b74.firebaseapp.com",
    projectId: "fckhuong-14b74",
    databaseURL: "https://fckhuong-14b74-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Khởi tạo Firebase (Dùng cú pháp Compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();