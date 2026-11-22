// Entry point. Phase 0: a blank canvas that proves the build works. Later phases boot the game here.
const canvas = document.getElementById('game');
canvas.width = 640;
canvas.height = 360;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#16131d';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#e8e2d4';
ctx.font = '20px system-ui';
ctx.fillText('Toska Engine', 24, 40);
