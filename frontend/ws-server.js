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

function emitOrderUpdated(order) {
  console.log('📢 Événement order_updated émis');
  io.emit('order_updated', order); // envoie la commande mise à jour à tous les clients
}

server.listen(4000, () => {
  console.log('✅ Serveur WebSocket sur ws://localhost:4000');
});

module.exports = { server, emitOrderUpdated };