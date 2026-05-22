@echo off
echo =================================================================
echo            🏎️   VIBERACING - LOCAL LAN DEPLOYMENT SYSTEM   🏎️
echo =================================================================
echo.
echo 1. Installando dipendenze se necessario...
call npm install
echo.
echo 2. Compilando l'applicazione (npm run build)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRORE] La compilazione e' fallita. Controlla gli errori sopra.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo 3. Recupero dell'indirizzo IP locale...
for /f "usebackq tokens=*" %%i in (`powershell -Command "(Get-NetIPAddress | ? AddressFamily -eq 'IPv4' | ? IPAddress -notlike '127.*' | ? IPAddress -notlike '169.254.*').IPAddress"`) do set LAN_IP=%%i
echo.
echo =================================================================
echo           🚀   IL SERVER LOCALE STA PARTENDO   🚀
echo =================================================================
echo.
echo Per giocare in multiplayer locale nella stessa stanza/Wi-Fi:
echo.
echo 💻 TU (Pilota / Host) apri nel tuo browser:
echo    http://localhost:3000
echo.
echo 👥 IL TUO AMICO (Ingegnere di Telemetria / Client) deve connettersi a:
echo    http://%LAN_IP%:3000
echo.
echo [Suggerimento]: Una volta avviata la stanza come Pilota, puoi copiare
echo l'indirizzo direttamente dal menu di gioco e passarlo al tuo amico!
echo.
echo Premere CTRL+C in questa finestra per terminare il server.
echo =================================================================
echo.
npx vite preview --port 3000 --host 0.0.0.0
pause
