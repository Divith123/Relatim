// Service Worker for push notifications
const CACHE_NAME = 'relatim-ai-chat-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('Service Worker: Caching app shell');
        // Cache only the files that exist and are accessible
        const cachePromises = urlsToCache.map(async (url) => {
          try {
            const response = await fetch(url, { 
              method: 'GET',
              cache: 'no-cache'
            });
            if (response.ok) {
              console.log(`Service Worker: Cached ${url}`);
              return cache.put(url, response);
            } else {
              console.warn(`Service Worker: Failed to cache ${url} - Status: ${response.status}`);
            }
          } catch (error) {
            console.warn(`Service Worker: Failed to cache ${url}:`, error.message);
          }
        });
        
        await Promise.allSettled(cachePromises);
        console.log('Service Worker: Installation complete');
      })
      .catch(error => {
        console.error('Service Worker: Installation failed:', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`Service Worker: Deleting old cache ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      // Ensure the service worker takes control immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline, but don't interfere with API calls
self.addEventListener('fetch', (event) => {
  // Skip caching for API calls and external resources
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('supabase.co') ||
      event.request.url.includes('socket.io') ||
      event.request.method !== 'GET') {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          console.log(`Service Worker: Serving ${event.request.url} from cache`);
          return response;
        }
        
        console.log(`Service Worker: Fetching ${event.request.url} from network`);
        return fetch(event.request).catch((error) => {
          console.warn(`Service Worker: Network fetch failed for ${event.request.url}:`, error);
          // Return a basic offline page or error response if needed
          return new Response('Offline - Please check your connection', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Push event - handle push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const defaultOptions = {
    body: 'You have a new message',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'message-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Message',
        icon: '/favicon.ico'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/favicon.ico'
      }
    ]
  };

  let notificationOptions = { ...defaultOptions };
  let title = 'Relatim AI Chat';

  if (event.data) {
    try {
      const data = event.data.json();
      console.log('Service Worker: Push data:', data);
      
      notificationOptions.body = data.message || notificationOptions.body;
      notificationOptions.tag = data.tag || notificationOptions.tag;
      notificationOptions.data = data;
      
      if (data.title) {
        title = data.title;
      }
      
      if (data.icon) {
        notificationOptions.icon = data.icon;
      }
    } catch (error) {
      console.error('Service Worker: Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
      .then(() => {
        console.log('Service Worker: Notification shown successfully');
      })
      .catch((error) => {
        console.error('Service Worker: Failed to show notification:', error);
      })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    // Open the app or focus existing window
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Background sync for offline message sending
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync-messages') {
    event.waitUntil(
      syncMessages()
        .then(() => {
          console.log('Service Worker: Background sync completed successfully');
        })
        .catch((error) => {
          console.error('Service Worker: Background sync failed:', error);
        })
    );
  }
});

async function syncMessages() {
  try {
    console.log('Service Worker: Starting message sync...');
    
    // Get pending messages from IndexedDB
    const pendingMessages = await getPendingMessages();
    console.log(`Service Worker: Found ${pendingMessages.length} pending messages`);
    
    for (const message of pendingMessages) {
      try {
        // Try to send the message
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${message.token}`
          },
          body: JSON.stringify(message.data)
        });
        
        if (response.ok) {
          console.log(`Service Worker: Successfully synced message ${message.id}`);
          // Remove from pending messages
          await removePendingMessage(message.id);
        } else {
          console.error(`Service Worker: Failed to sync message ${message.id} - Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Service Worker: Failed to sync message ${message.id}:`, error);
      }
    }
    
    console.log('Service Worker: Message sync completed');
  } catch (error) {
    console.error('Service Worker: Background sync failed:', error);
    throw error;
  }
}

// IndexedDB helpers for offline functionality
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('relatim-ai-chat', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingMessages')) {
        const store = db.createObjectStore('pendingMessages', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function getPendingMessages() {
  const db = await openDB();
  const transaction = db.transaction(['pendingMessages'], 'readonly');
  const store = transaction.objectStore('pendingMessages');
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function addPendingMessage(message) {
  const db = await openDB();
  const transaction = db.transaction(['pendingMessages'], 'readwrite');
  const store = transaction.objectStore('pendingMessages');
  
  return new Promise((resolve, reject) => {
    const request = store.add({
      id: Date.now().toString(),
      data: message,
      timestamp: Date.now()
    });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removePendingMessage(id) {
  const db = await openDB();
  const transaction = db.transaction(['pendingMessages'], 'readwrite');
  const store = transaction.objectStore('pendingMessages');
  
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Message handling for communication with main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_MESSAGE':
      addPendingMessage(data)
        .then(() => {
          event.ports[0].postMessage({ success: true });
        })
        .catch((error) => {
          event.ports[0].postMessage({ success: false, error: error.message });
        });
      break;
      
    default:
      break;
  }
});