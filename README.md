# AI Football Championship — Mobile-ready

## Run from the VS Code terminal (no launcher files)

1. Open this `arduino-football-championship` folder in VS Code.
2. Open Terminal → New Terminal. The terminal must be in this folder.
3. Run:

```powershell
py -m http.server 5500 --bind 0.0.0.0 --directory .\web
```

4. On the laptop, open http://127.0.0.1:5500/
5. On a phone/tablet on the same Wi-Fi, find the laptop Wi-Fi IPv4 address using `ipconfig`, then open `http://LAPTOP-IP:5500/` (example: `http://192.168.1.5:5500/`).

Keep the terminal running while playing. Press Ctrl+C in the terminal to stop the server.

If Windows Firewall asks, allow Python on **Private networks**. If port 5500 is already in use, use 5501 in the command and in both browser addresses.

The local server shares the same static game files. At this stage each device has its own independent AI tournament; shared multiplayer is a later upgrade.
