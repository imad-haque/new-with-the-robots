const WebSocket = require("ws");
const robot = require("robotjs");

console.log("🖥️ Starting Desktop Agent for Remote Control...");

const wss = new WebSocket.Server({ port: 3001 });

const screen = robot.getScreenSize();
const width = screen.width, height = screen.height;

console.log(`✅ Screen size detected: ${width}x${height}`);
console.log("✅ Agent WebSocket running on ws://localhost:3001");

wss.on("connection", (ws) => {
    console.log("🌐 Connected from browser/client");

    ws.on("message", (data) => {
        try {
            const e = JSON.parse(data);
            const x = Math.round(e.x * width);
            const y = Math.round(e.y * height);

            switch (e.type) {
                case "mousemove": robot.moveMouse(x, y); break;
                case "mousedown": robot.mouseToggle("down", e.button === 2 ? "right" : "left"); break;
                case "mouseup": robot.mouseToggle("up", e.button === 2 ? "right" : "left"); break;
                case "wheel": robot.scrollMouse(e.deltaX || 0, e.deltaY || 0); break;
                case "keydown": if (e.key?.length === 1) robot.keyToggle(e.key.toLowerCase(), "down"); break;
                case "keyup": if (e.key?.length === 1) robot.keyToggle(e.key.toLowerCase(), "up"); break;
                default: console.warn("⚠ Unknown event:", e.type);
            }
        } catch (err) {
            console.error("❌ Invalid control data:", err.message);
        }
    });

    ws.on("close", () => console.log("🔌 Browser disconnected"));
    ws.on("error", (err) => console.error("❌ WS error:", err.message));
});
