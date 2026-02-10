import { io, Socket } from "socket.io-client";

// Connect to your separate server port
const SERVER_URL = "http://localhost:4000";

let socket: Socket;

export const getSocket = () => {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false, // We connect manually when needed
    });
  }
  return socket;
};