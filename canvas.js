const canvas = document.querySelector('#visuals');
 canvas.width = 1000;
 canvas.height = 150;
const ctx = canvas.getContext('2d'); 
background = '#ABC';

function clear_canvas() {
    mem = ctx.fillStyle;
    ctx.fillStyle = background;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = mem;
}

clear_canvas();
