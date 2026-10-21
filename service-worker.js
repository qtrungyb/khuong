// ĐỔI TÊN BIẾN NÀY MỖI KHI BẠN CẬP NHẬT CODE MỚI (VD: v1.1, v1.2...)
const CACHE_NAME = 'ver1.6';

const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/firebase-config.js',
    './js/app.js'
];

// 1. Cài đặt Service Worker và lưu Cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Đã mở cache và lưu trữ tài nguyên');
                return cache.addAll(urlsToCache);
            })
    );
    // Ép Service Worker mới thay thế cái cũ ngay lập tức (không chờ tab đóng)
    self.skipWaiting(); 
});

// 2. Kích hoạt và dọn dẹp Cache của phiên bản cũ
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Đang xóa cache cũ:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Yêu cầu SW kiểm soát các trang ngay lập tức
    self.clients.claim(); 
});

// 3. Phục vụ tài nguyên từ Cache, nếu không có thì tải từ Internet
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Trả về từ Cache nếu có, ngược lại gọi Network
                return response || fetch(event.request);
            })
    );
});
