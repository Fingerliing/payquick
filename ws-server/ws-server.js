const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('🟢 Client connecté');

  socket.on('join_order', (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`📦 Client rejoint la room order_${orderId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client déconnecté');
  });
});

app.post('/emit-order', (req, res) => {
  const order = req.body;
  console.log('📢 Reçu nouvelle commande via HTTP:', order);

  io.emit('order_updated', order);
  io.to(`order_${order.order}`).emit('order_updated', order);
  
  res.status(200).send({ message: 'Order emitted' });
});

server.listen(4000, () => {
  console.log('✅ Serveur WebSocket & HTTP démarré sur http://localhost:4000');
});