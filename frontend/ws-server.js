const { Server } = require('socket.io');
const http = require('http');

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('🟢 Client connecté');

  socket.on('disconnect', () => {
    console.log('🔴 Client déconnecté');
  });
});

// Exemple de notification automatique (à supprimer en production)
setInterval(() => {
  console.log('📢 Événement order_updated émis');
  io.emit('order_updated');
}, 10000);

server.listen(4000, () => {
  console.log('✅ Serveur WebSocket sur ws://localhost:4000');
});